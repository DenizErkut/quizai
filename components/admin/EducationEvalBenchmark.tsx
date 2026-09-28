'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react'

type Objective = { id: string; objective_code: string; title: string }
type Resource = { id: string; title: string; grade: string; subject: string; sourceVersion: string; evidenceUrls: string[]; evidenceCount: number; questionCount: number; objectives: Objective[] }
type Candidate = { id: string; question: any; grade: string; subject: string; topic: string; resourceId: string; resourceTitle: string }

export default function EducationEvalBenchmark() {
  const [data, setData] = useState<any>(null)
  const [resourceId, setResourceId] = useState('')
  const [questionId, setQuestionId] = useState('')
  const [objectiveId, setObjectiveId] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/education-eval/benchmark', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Benchmark verileri alınamadı.')
      setData(result)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Beklenmeyen hata.') }
    finally { setBusy(false) }
  }, [])

  // Loading here synchronizes the admin panel with server state; the setter is
  // only reached after the network request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const resources: Resource[] = data?.resources || []
  const candidates: Candidate[] = useMemo(() => data?.candidates || [], [data])
  const selectedResource = resources.find(resource => resource.id === resourceId)
  const questions = useMemo(() => candidates.filter(question => question.resourceId === resourceId), [candidates, resourceId])
  const selectedQuestion = questions.find(question => question.id === questionId)

  function selectResource(id: string) {
    setResourceId(id); setQuestionId(''); setObjectiveId(''); setConfirmed(false); setMessage('')
  }

  async function mutate(method: 'POST' | 'DELETE', body?: any, itemId?: string) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/admin/education-eval/benchmark${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'İşlem tamamlanamadı.')
      setMessage(method === 'DELETE' ? 'Soru taslak setten çıkarıldı.' : body?.action === 'activate' ? 'Benchmark etkinleştirildi.' : 'Soru doğrulanmış başlangıç setine eklendi.')
      setConfirmed(false); setQuestionId(''); setObjectiveId('')
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Beklenmeyen hata.') }
    finally { setBusy(false) }
  }

  if (!data) return <div className="card">{busy ? 'Benchmark durumu yükleniyor…' : message || 'Benchmark verisi bekleniyor.'}</div>
  const benchmark = data.benchmark
  const eligible = data.metricCount || 0
  const canActivate = eligible === (benchmark?.target_size || 50) && benchmark?.status === 'draft'

  return <div className="card" style={{ display: 'grid', gap: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <div><strong>🎯 MEB kontrollü başlangıç seti</strong><div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>{benchmark?.title || '50 soruluk benchmark'}</div></div>
      <button className="btn btn-sm" onClick={() => void load()} disabled={busy}>Yenile</button>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
      <div className="card"><strong>{eligible} / {benchmark?.target_size || 50}</strong><div>ölçüme uygun soru</div></div>
      <div className="card"><strong>{data.readiness.teacherApprovedBooklets}</strong><div>onaylı öğretmen kitapçığı</div></div>
      <div className="card"><strong>{data.readiness.eligibleBooklets}</strong><div>kanıt görselli kaynak</div></div>
      <div className="card"><strong>{data.regressionCount}</strong><div>regresyon vakası · metriğe dahil değil</div></div>
    </div>

    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, color: 'var(--text2)', lineHeight: 1.55 }}>
      Yalnızca öğretmen onaylı, yayın izni kanıtı ekli, kaynak kitapçıkla birebir eşleşen ve doğrulanmış aktif kazanıma bağlanan sorular 50 soruluk başarı metriğine dahil edilir. Set etkinleşince soru ve cevap anlık görüntüleri sürüm kilidiyle korunur.
      {data.readiness.missingEvidenceBooklets > 0 && <div style={{ marginTop: 8, color: 'var(--red, #b54735)' }}>{data.readiness.missingEvidenceBooklets} onaylı kitapçıkta kanıt görseli bulunmadığından bu kitapçıklar henüz aday olamaz.</div>}
    </div>

    {benchmark?.status === 'draft' && <div style={{ display: 'grid', gap: 10 }}>
      <strong>Doğrulanmış soruyu sete ekle</strong>
      <select className="input" value={resourceId} onChange={event => selectResource(event.target.value)}>
        <option value="">Kanıtlı öğretmen kitapçığı seç</option>
        {resources.map(resource => <option key={resource.id} value={resource.id}>{resource.title} · {resource.grade} · {resource.subject} · {resource.questionCount} uygun soru</option>)}
      </select>
      {selectedResource && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{selectedResource.evidenceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Yayın izni kanıtı ${index + 1}`} style={{ width: 130, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /></a>)}</div>
        <select className="input" value={questionId} onChange={event => { setQuestionId(event.target.value); setConfirmed(false) }}>
          <option value="">Kitapçıktan birebir çıkarılmış soru seç</option>
          {questions.map(question => <option key={question.id} value={question.id}>{question.topic} · {question.question.q.slice(0, 110)}</option>)}
        </select>
        {selectedQuestion && <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg2, #f7f1e9)' }}>
          <div><strong>{selectedQuestion.question.q}</strong></div>
          <ol type="A">{selectedQuestion.question.opts.map((option: string, index: number) => <li key={index}>{option}{index === selectedQuestion.question.ans ? ' ✓' : ''}</li>)}</ol>
          <label style={{ display: 'block', marginTop: 10 }}>Kazanım
            <select className="input" style={{ marginTop: 6 }} value={objectiveId} onChange={event => setObjectiveId(event.target.value)}>
              <option value="">Doğrulanmış kazanım seç</option>
              {selectedResource.objectives.map(objective => <option key={objective.id} value={objective.id}>{objective.objective_code} · {objective.title}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={confirmed} disabled={selectedResource.evidenceUrls.length === 0} onChange={event => setConfirmed(event.target.checked)} />
            <span>Bu sorunun kitapçıktaki metin ve seçeneklerle birebir olduğunu, doğru cevabı ve ekli öğretmen yayın izni kanıtını kontrol ettim.</span>
          </label>
          {selectedResource.evidenceUrls.length === 0 && <small style={{ color: 'var(--red, #b54735)' }}>Kanıt görseli görüntülenemiyor; kaynağı yenileyip tekrar kontrol edin.</small>}
          <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy || !objectiveId || !confirmed || selectedResource.evidenceUrls.length === 0}
            onClick={() => void mutate('POST', { action: 'add', sourceResourceId: resourceId, questionBankId: questionId, objectiveId, sourceVersion: selectedResource.sourceVersion, evidenceConfirmed: confirmed })}>Benchmark’a ekle</button>
        </div>}
      </>}
      <button className="btn btn-primary" disabled={!canActivate || busy} onClick={() => void mutate('POST', { action: 'activate' })}>50 soruluk seti kilitle ve etkinleştir</button>
      {!canActivate && <small style={{ color: 'var(--text2)' }}>Etkinleştirme, tam 50 uygun soru tamamlandığında açılır. Taslak şu an {eligible}/50.</small>}
    </div>}

    {benchmark?.status !== 'draft' && <div><strong>Durum:</strong> {benchmark.status === 'active' ? 'Etkin ve sürüm kilitli' : 'Emekli'}</div>}

    <div><strong>Set içeriği ({data.items.length})</strong>
      <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>{data.items.map((item: any) => <div key={item.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 13 }}>
        <b>{item.ordinal}. {item.objective_code}</b> · {item.grade} · {item.subject} · {item.case_type === 'regression' ? 'regresyon (metrik dışı)' : 'öğretmen onaylı'}
        <div>{item.question_snapshot?.q}</div>
        <small style={{ color: 'var(--text2)' }}>{item.source_reference} · sürüm {item.source_version?.slice(0, 12)}… · {item.metric_eligible ? 'ölçüme dahil' : 'ölçüm dışı'}</small>
        {benchmark.status === 'draft' && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => void mutate('DELETE', undefined, item.id)}>Çıkar</button>}
      </div>)}</div>
    </div>
    {message && <div role="status">{message}</div>}
  </div>
}
