'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Facets = { grades: string[]; subjects: string[]; topics: string[] }

export default function QuestionBankEditor() {
  const [rows, setRows] = useState<any[]>([]); const [editing, setEditing] = useState<any>(null); const [msg, setMsg] = useState('')
  const [filters, setFilters] = useState({ grade: '', subject: '', topic: '' })
  const [facets, setFacets] = useState<Facets>({ grades: [], subjects: [], topics: [] })
  // 27 Eylul 2026 — filtreler artik sunucu tarafinda uygulaniyor (bkz.
  // app/api/admin/question-bank-review/route.ts). Acilir kutu secenekleri
  // (facets) sunucudan havuzun TAMAMI uzerinden geliyor, sadece o an ekranda
  // olan satirlardan degil — boylece toplu bir yukleme diger sinif/ders/konu
  // secimlerini gizleyemiyor.
  async function load(f: typeof filters) {
    const { data: { session } } = await createClient().auth.getSession()
    const params = new URLSearchParams()
    if (f.grade) params.set('grade', f.grade)
    if (f.subject) params.set('subject', f.subject)
    if (f.topic) params.set('topic', f.topic)
    const qs = params.toString()
    const r = await fetch(`/api/admin/question-bank-review${qs ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const d = await r.json()
    if (r.ok) { setRows(d.questions || []); if (d.facets) setFacets(d.facets) }
  }
  useEffect(() => { void load(filters) }, [filters.grade, filters.subject, filters.topic])
  async function save() { const { data: { session } } = await createClient().auth.getSession(); const r = await fetch('/api/admin/question-bank-review', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ id: editing.id, question: editing.question }) }); const d = await r.json(); setMsg(r.ok ? '✓ Düzenlendi ve yeniden onaya gönderildi.' : `❌ ${d.error || 'Hata'}`); if (r.ok) { setEditing(null); void load(filters) } }
  async function decide(id: string, decision: 'approved' | 'rejected') { const { data: { session } } = await createClient().auth.getSession(); const r = await fetch('/api/admin/question-bank-review', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ id, decision }) }); const d = await r.json(); setMsg(r.ok ? (decision === 'approved' ? '✓ Onaylandı.' : '✓ Reddedildi.') : `❌ ${d.error || 'Hata'}`); if (r.ok) void load(filters) }
  const optionsFor = (key: 'grade' | 'subject' | 'topic') => key === 'grade' ? facets.grades : key === 'subject' ? facets.subjects : facets.topics
  return <div className="card"><div style={{display:'flex',justifyContent:'space-between'}}><strong>📝 Soru havuzu inceleme</strong><button className="btn btn-sm" onClick={()=>void load(filters)}>Yenile</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:12}}>{(['grade','subject','topic'] as const).map(key=><select key={key} className="input" value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}><option value="">{key==='grade'?'Tüm sınıflar':key==='subject'?'Tüm dersler':'Tüm konular'}</option>{optionsFor(key).map(v=><option key={v} value={v}>{v}</option>)}</select>)}</div>
    {msg&&<p style={{fontSize:12}}>{msg}</p>}<div style={{display:'grid',gap:8,marginTop:12}}>{rows.map(r=><div key={r.id} style={{borderTop:'1px solid var(--border)',paddingTop:8,fontSize:12}}>
      <div><b>{r.topic_key}</b> · {r.difficulty} · {r.review_status}
        {r.review_status === 'candidate' && (r.awaiting_expert_review
          ? <span style={{color:'var(--red, #c0392b)'}}> · ⚠️ uzman incelemesi bekliyor{r.report_count ? ` (${r.report_count} rapor)` : ''}</span>
          : <span style={{color:'var(--text2)'}}> · 🕒 gölge inceleme (rapor gelmezse otomatik onaylanır)</span>)}
        {r.ai_provider && <span style={{color:'var(--text3)'}}> · {r.ai_provider}/{r.ai_model}</span>}
      </div>
      <div style={{margin:'5px 0'}}>{r.question?.q}</div>
      <div style={{display:'flex',gap:6}}>
        <button className="btn btn-sm" onClick={()=>setEditing({...r,question:{...r.question}})}>Düzenle</button>
        {r.review_status === 'candidate' && <>
          <button className="btn btn-sm" onClick={()=>void decide(r.id,'approved')}>Onayla</button>
          <button className="btn btn-sm" onClick={()=>void decide(r.id,'rejected')}>Reddet</button>
        </>}
      </div>
    </div>)}</div>{editing&&<div style={{marginTop:16}}><textarea className="input" rows={4} value={editing.question.q} onChange={e=>setEditing({...editing,question:{...editing.question,q:e.target.value}})} /><button className="btn btn-primary" onClick={()=>void save()} style={{marginTop:8}}>Yeniden onaya gönder</button></div>}</div>
}
