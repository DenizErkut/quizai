'use client'
import MathText from "@/components/MathText"
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { matchVerifiedObjectiveCode } from '@/lib/learning-objective-codes'

type Objective = { id: string; objective_code: string; title: string }
type Resource = { id: string; title: string; grade: string; subject: string; sourceVersion: string; evidenceUrls: string[]; evidenceCount: number; questionCount: number; objectives: Objective[] }
type Candidate = { id: string; question: any; grade: string; subject: string; topic: string; resourceId: string; resourceTitle: string }
type AiResource = { id: string; title: string; grade: string; subject: string; topic: string; questionCount: number; objectives: Objective[] }

export default function EducationEvalBenchmark() {
  const [data, setData] = useState<any>(null)
  const [version, setVersion] = useState(1)
  const [resourceId, setResourceId] = useState('')
  const [questionId, setQuestionId] = useState('')
  const [objectiveId, setObjectiveId] = useState('')
  const [aiResourceId, setAiResourceId] = useState('')
  const [aiQuestionId, setAiQuestionId] = useState('')
  const [aiObjectiveId, setAiObjectiveId] = useState('')
  const [mappingObjectiveByItem, setMappingObjectiveByItem] = useState<Record<string, string>>({})
  const [showAllAiItems, setShowAllAiItems] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/education-eval/benchmark?version=${version}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Benchmark verileri alınamadı.')
      setData(result)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Beklenmeyen hata.') }
    finally { setBusy(false) }
  }, [version])

  // Loading here synchronizes the admin panel with server state; the setter is
  // only reached after the network request resolves.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const resources: Resource[] = data?.resources || []
  const candidates: Candidate[] = useMemo(() => data?.candidates || [], [data])
  const aiResources: AiResource[] = data?.aiResources || []
  const aiCandidates: Candidate[] = useMemo(() => data?.aiCandidates || [], [data])
  const aiItems: any[] = data?.aiItems || []
  const selectedResource = resources.find(resource => resource.id === resourceId)
  const questions = useMemo(() => candidates.filter(question => question.resourceId === resourceId), [candidates, resourceId])
  const selectedQuestion = questions.find(question => question.id === questionId)
  const selectedAiResource = aiResources.find(resource => resource.id === aiResourceId)
  const aiQuestions = useMemo(() => aiCandidates.filter(question => question.resourceId === aiResourceId), [aiCandidates, aiResourceId])
  const selectedAiQuestion = aiQuestions.find(question => question.id === aiQuestionId)

  function selectResource(id: string) {
    setResourceId(id); setQuestionId(''); setObjectiveId(''); setConfirmed(false); setMessage('')
  }

  function selectQuestion(id: string) {
    const question = questions.find(candidate => candidate.id === id)
    const code = matchVerifiedObjectiveCode(question?.question?.learningObjectiveCode, selectedResource?.objectives.map(objective => objective.objective_code) || [])
    const objective = code ? selectedResource?.objectives.find(candidate => candidate.objective_code.toLocaleUpperCase('tr-TR') === code) : null
    setQuestionId(id)
    setObjectiveId(objective?.id || '')
    setConfirmed(false)
  }

  function selectAiResource(id: string) {
    setAiResourceId(id); setAiQuestionId(''); setAiObjectiveId(''); setMessage('')
  }

  function selectAiQuestion(id: string) {
    const question = aiQuestions.find(candidate => candidate.id === id)
    const code = matchVerifiedObjectiveCode(question?.question?.learningObjectiveCode, selectedAiResource?.objectives.map(objective => objective.objective_code) || [])
    const objective = code ? selectedAiResource?.objectives.find(candidate => candidate.objective_code.toLocaleUpperCase('tr-TR') === code) : null
    setAiQuestionId(id); setAiObjectiveId(objective?.id || '')
  }

  async function mutate(method: 'POST' | 'DELETE', body?: any, itemId?: string) {
    setBusy(true); setMessage('')
    try {
      const aiItemId = body?.action === 'delete-ai' ? body.itemId : undefined
      const query = aiItemId ? `?aiItemId=${encodeURIComponent(aiItemId)}` : itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''
      const requestBody = body?.action === 'delete-ai' ? undefined : body ? { ...body, version } : undefined
      const response = await fetch(`/api/admin/education-eval/benchmark${query}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: requestBody ? JSON.stringify(requestBody) : undefined,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'İşlem tamamlanamadı.')
      setMessage(method === 'DELETE' ? 'Soru değerlendirme havuzundan çıkarıldı.' : body?.action === 'activate' ? 'Benchmark etkinleştirildi.' : body?.action === 'add-ai' ? 'AI sorusu ayrı değerlendirme havuzuna eklendi.' : body?.action === 'map-ai' ? 'Doğrulanmış kazanım AI sorusuna bağlandı.' : 'Soru doğrulanmış başlangıç setine eklendi.')
      setConfirmed(false); setQuestionId(''); setObjectiveId(''); setAiQuestionId(''); setAiObjectiveId('')
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Beklenmeyen hata.') }
    finally { setBusy(false) }
  }

  async function reprocessAiBooklet(resource: AiResource) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/exam-upload', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reprocess-ai-booklet', id: resource.id }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kitapçık yeniden işlenemedi.')
      setMessage(`${resource.title}: ${result.promoted} soru havuza aktarıldı; AI değerlendirme havuzu güncellendi.`)
      await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Yeniden işleme başarısız oldu.') }
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
    <label>Benchmark sürümü <select value={version} disabled={busy} onChange={event => { setVersion(Number(event.target.value)); setResourceId(''); setQuestionId(''); setObjectiveId(''); setConfirmed(false) }}>
      {(data.versions || [{ version: 1, status: benchmark.status }]).map((item: any) => <option key={item.version} value={item.version}>v{item.version} · {item.status === 'draft' ? 'Taslak — yeni sonuç üretilmedi' : 'Kilitli geçmiş sürüm'}</option>)}
    </select></label>
    <small>Bu seçim eski değerlendirme sonuçlarını değiştirmez. Yeni sürüm, kazanım ve insan incelemesi tamamlanmadan etkinleştirilmez.</small>

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

    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'grid', gap: 10 }}>
      <div><strong>🤖 AI kitapçığı değerlendirme havuzu</strong><div style={{ color: 'var(--text2)', fontSize: 13, marginTop: 4 }}>
        AI ile üretilip yüklenen, soruları bağımsız kalite kontrolünden geçmiş kitapçık soruları burada tutulur. Bu sorular model karşılaştırmaları için adaydır; öğretmen onaylı 50 soruluk MEB başarı metriğine ve kanıt şartına dahil edilmez.
      </div></div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
        <span><strong>{aiItems.length}</strong> soru havuzda</span>
        <span><strong>{aiItems.filter((item: any) => item.status === 'ready').length}</strong> kazanımı eşleşmiş</span>
        <span><strong>{aiItems.filter((item: any) => item.status !== 'ready').length}</strong> kazanım bekliyor</span>
      </div>
      {aiResources.length === 0 && <small style={{ color: 'var(--text2)' }}>Onaylı AI kaynaklı anlık test kitapçığı bulunmuyor.</small>}
      {aiResources.length > 0 && <>
        <label>AI kitapçığı
          <select className="input" style={{ marginTop: 5 }} value={aiResourceId} onChange={event => selectAiResource(event.target.value)}>
            <option value="">Kitapçık seç</option>
            {aiResources.map(resource => <option key={resource.id} value={resource.id}>{resource.title} · {resource.grade}. sınıf · {resource.subject} · {resource.questionCount} soru</option>)}
          </select>
        </label>
        {selectedAiResource && selectedAiResource.questionCount === 0 && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <small style={{ color: 'var(--text2)' }}>Bu kitapçıkta henüz havuza bağlanmış soru yok. Metni yeniden tarayıp uygun soruları çıkarabilirsin.</small>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void reprocessAiBooklet(selectedAiResource)}>Kitapçığı yeniden tara</button>
        </div>}
        {aiQuestions.length > 0 && <>
          <select className="input" value={aiQuestionId} onChange={event => selectAiQuestion(event.target.value)}>
            <option value="">Havuza yeni eklenecek AI sorusunu seç</option>
            {aiQuestions.map(question => <option key={question.id} value={question.id}>{question.topic} · {question.question.q.slice(0, 110)}</option>)}
          </select>
          {selectedAiQuestion && <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg2, #f7f1e9)' }}>
            <div><strong><MathText text={selectedAiQuestion.question.q} /></strong></div>
            <ol type="A">{selectedAiQuestion.question.opts.map((option: string, index: number) => <li key={index}><MathText text={option} />{index === selectedAiQuestion.question.ans ? ' ✓' : ''}</li>)}</ol>
            <label>Doğrulanmış MEB kazanımı
              <select className="input" style={{ marginTop: 5 }} value={aiObjectiveId} onChange={event => setAiObjectiveId(event.target.value)}>
                <option value="">Kazanım seç</option>
                {selectedAiResource?.objectives.map(objective => <option key={objective.id} value={objective.id}>{objective.objective_code} · {objective.title}</option>)}
              </select>
            </label>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy || !aiObjectiveId}
              onClick={() => void mutate('POST', { action: 'add-ai', sourceResourceId: aiResourceId, questionBankId: aiQuestionId, objectiveId: aiObjectiveId })}>AI değerlendirme havuzuna ekle</button>
          </div>}
        </>}
      </>}
      {aiItems.length > 0 && <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
        <strong>AI değerlendirme havuzu içeriği ({aiItems.length})</strong>
        {(showAllAiItems ? aiItems : aiItems.slice(0, 20)).map((item: any) => {
          const resource = aiResources.find(candidate => candidate.id === item.source_resource_id)
          const objectives = resource?.objectives || []
          return <div key={item.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 13 }}>
            <b>{item.objective_code || 'Kazanım eşlemesi bekliyor'}</b> · {item.grade}. sınıf · {item.subject} · AI kaynaklı
            <div><MathText text={item.question_snapshot?.q} /></div>
            <small style={{ color: 'var(--text2)' }}>{resource?.title || 'AI kitapçığı'} · öğretmen benchmark metriği dışı</small>
            {item.status !== 'ready' && objectives.length > 0 && <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <select className="input" style={{ maxWidth: 600 }} value={mappingObjectiveByItem[item.id] || ''}
                onChange={event => setMappingObjectiveByItem(previous => ({ ...previous, [item.id]: event.target.value }))}>
                <option value="">Doğrulanmış kazanım seç</option>
                {objectives.map(objective => <option key={objective.id} value={objective.id}>{objective.objective_code} · {objective.title}</option>)}
              </select>
              <button className="btn btn-sm" disabled={busy || !mappingObjectiveByItem[item.id]}
                onClick={() => void mutate('POST', { action: 'map-ai', aiItemId: item.id, objectiveId: mappingObjectiveByItem[item.id] })}>Kazanımı bağla</button>
            </div>}
          </div>
        })}
        {aiItems.length > 20 && <button className="btn btn-sm" style={{ justifySelf: 'start' }} onClick={() => setShowAllAiItems(value => !value)}>
          {showAllAiItems ? 'Daha az göster' : `Tüm ${aiItems.length} soruyu göster`}
        </button>}
      </div>}
    </div>

    {benchmark?.status === 'draft' && <div style={{ display: 'grid', gap: 10 }}>
      <strong>Doğrulanmış soruyu sete ekle</strong>
      <select className="input" value={resourceId} onChange={event => selectResource(event.target.value)}>
        <option value="">Kanıtlı öğretmen kitapçığı seç</option>
        {resources.map(resource => <option key={resource.id} value={resource.id}>{resource.title} · {resource.grade} · {resource.subject} · {resource.questionCount} uygun soru</option>)}
      </select>
      {selectedResource && <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{selectedResource.evidenceUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Yayın izni kanıtı ${index + 1}`} style={{ width: 130, height: 90, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /></a>)}</div>
        <select className="input" value={questionId} onChange={event => selectQuestion(event.target.value)}>
          <option value="">Kitapçıktan birebir çıkarılmış soru seç</option>
          {questions.map(question => <option key={question.id} value={question.id}>{question.question.learningObjectiveCode ? `${question.question.learningObjectiveCode} · ` : ''}{question.topic} · {question.question.q.slice(0, 110)}</option>)}
        </select>
        {selectedQuestion && <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg2, #f7f1e9)' }}>
          <div><strong><MathText text={selectedQuestion.question.q} /></strong></div>
          <ol type="A">{selectedQuestion.question.opts.map((option: string, index: number) => <li key={index}><MathText text={option} />{index === selectedQuestion.question.ans ? ' ✓' : ''}</li>)}</ol>
          {selectedQuestion.question.learningObjectiveCode && objectiveId && <small style={{ color: 'var(--green, #15803d)' }}>Kazanım kodu otomatik eşleştirildi: {selectedQuestion.question.learningObjectiveCode}</small>}
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
        <b>{item.ordinal}. {item.objective_code}</b> · {item.grade} · {item.subject} · {item.case_type === 'regression' ? 'regresyon (metrik dışı)' : item.teacher_approved ? 'öğretmen onaylı' : 'yeniden insan incelemesi gerekli'}
        <div><MathText text={item.question_snapshot?.q} /></div>
        {item.review_notes && <div style={{ color: 'var(--text2)' }}>{item.review_notes}</div>}
        {benchmark.status === 'draft' && !item.teacher_approved && <button className="btn btn-sm" disabled={busy} onClick={() => void mutate('POST', { action: 'review-draft', itemId: item.id, confirmed: true })}>Soru ve düzeltilmiş kazanımı inceledim — insan onayı ver</button>}
        <small style={{ color: 'var(--text2)' }}>{item.source_reference} · sürüm {item.source_version?.slice(0, 12)}… · {item.metric_eligible ? 'ölçüme dahil' : 'ölçüm dışı'}</small>
        {benchmark.status === 'draft' && <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => void mutate('DELETE', undefined, item.id)}>Çıkar</button>}
      </div>)}</div>
    </div>
    {message && <div role="status">{message}</div>}
  </div>
}
