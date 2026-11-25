# Kazanım eşleştirme embedding ölçümü (AI planı P1-3). Girdi: gold_human.json, gold_neg.json, catalog.json (üretim DB'sinden salt-okunur çıkarılır; depoya konmaz).
# Çalıştırma: HF_HUB_OFFLINE=1 python eval_emb.py e5 qwen  (sentence-transformers + torch gerekir; CPU yeterli)
import json, sys, time, math, collections, os, re
import numpy as np
from sentence_transformers import SentenceTransformer
gold=json.load(open('gold_human.json',encoding='utf-8')); neg=json.load(open('gold_neg.json',encoding='utf-8')); cat=json.load(open('catalog.json',encoding='utf-8'))
bycode={c['code']:c for c in cat}
# (subject_key, grade_key) -> (catalog subject, grade) türetilmesi: altın etiketten
sg={}
for g in gold: sg[(g['subject'],g['grade'])]=(bycode[g['code']]['subject'],bycode[g['code']]['grade'])
pools=collections.defaultdict(list)
for c in cat: pools[(c['subject'],c['grade'])].append(c)
def obj_text(c): return ' | '.join(x for x in [c['subject'],c['grade'],c.get('unit') or '',c.get('topic') or '',c['title']] if x)
TASK='Verilen soruyu ölçtüğü müfredat kazanımıyla eşleştir'
def run(name, model_id, q_prefix, p_prefix, **kw):
    t0=time.time(); m=SentenceTransformer(model_id, device='cpu', trust_remote_code=False, **kw); load=time.time()-t0
    texts_o=[p_prefix+obj_text(c) for c in cat]; t=time.time()
    eo=m.encode(texts_o, batch_size=16, normalize_embeddings=True, show_progress_bar=False); t_obj=time.time()-t
    idx={c['code']:i for i,c in enumerate(cat)}
    def rank(item):
        pool=sg.get((item['subject'],item['grade']))
        if pool is None: return None
        return pool
    qs=[q_prefix+g['text'] for g in gold]; t=time.time()
    eq=m.encode(qs, batch_size=16, normalize_embeddings=True, show_progress_bar=False); t_q=time.time()-t
    res=[]; lat=t_q/len(qs)
    for g,v in zip(gold,eq):
        pool=pools[sg[(g['subject'],g['grade'])]]; ids=[idx[c['code']] for c in pool]
        sc=eo[ids]@v; order=np.argsort(-sc); codes=[pool[i]['code'] for i in order]
        res.append(dict(g=g,codes=codes,top=float(sc[order[0]]),pool=len(pool)))
    top1=np.mean([r['codes'][0]==r['g']['code'] for r in res]); top3=np.mean([r['g']['code'] in r['codes'][:3] for r in res]); top5=np.mean([r['g']['code'] in r['codes'][:5] for r in res])
    mrr=np.mean([1/(r['codes'].index(r['g']['code'])+1) for r in res]); rand=np.mean([1/r['pool'] for r in res])
    bysub=collections.defaultdict(list)
    for r in res: bysub[(r['g']['subject'],r['g']['grade'])].append(r)
    per={f"{k[0]}|{k[1]}":dict(n=len(v),top1=round(float(np.mean([x['codes'][0]==x['g']['code'] for x in v])),3),top3=round(float(np.mean([x['g']['code'] in x['codes'][:3] for x in v])),3)) for k,v in sorted(bysub.items(), key=lambda kv:-len(kv[1]))}
    # negatifler: en yüksek benzerlik skorunun pozitiflerden ayrışması (AUROC; yüksek skor = eşleşme var)
    nscores=[]
    en=m.encode([q_prefix+n['text'] for n in neg], batch_size=16, normalize_embeddings=True, show_progress_bar=False)
    for n,v in zip(neg,en):
        p=sg.get((n['subject'],n['grade']))
        if not p: continue
        pool=pools[p]; ids=[idx[c['code']] for c in pool]; nscores.append(float((eo[ids]@v).max()))
    pos=[r['top'] for r in res]
    auc=float(np.mean([(p>n)+0.5*(p==n) for p in pos for n in nscores])) if nscores else None
    return dict(model=name, id=model_id, n=len(res), top1=round(float(top1),4), top3=round(float(top3),4), top5=round(float(top5),4), mrr=round(float(mrr),4), random_top1=round(float(rand),4),
        load_s=round(load,1), enc_objectives_s=round(t_obj,1), q_latency_ms_cpu=round(lat*1000,1), auroc_match_vs_nomatch=None if auc is None else round(auc,4), neg_n=len(nscores), per_group=per)
out=[]
which=sys.argv[1:]
if 'e5' in which:
    out.append(run('multilingual-e5-large-instruct','intfloat/multilingual-e5-large-instruct', f'Instruct: {TASK}\nQuery: ', ''))  # kazanım tarafı: belge öneki yok (model kartı: yalnızca sorguda instruct)
if 'qwen' in which:
    out.append(run('Qwen3-Embedding-0.6B','Qwen/Qwen3-Embedding-0.6B', f'Instruct: {TASK}\nQuery:', ''))
print(json.dumps(out,ensure_ascii=False,indent=1))
json.dump(out,open('result_'+'_'.join(which)+'.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
