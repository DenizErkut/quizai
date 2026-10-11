'use client'
import MathText from "@/components/MathText"

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'
import LearningEvidenceChain from './LearningEvidenceChain'
import VerifiedLearningPlans from './VerifiedLearningPlans'
import { sharedQuestionCount } from '@/lib/question-signature'

type Classroom = { id: string; name: string }
type Session = {
  id: string; createdAt: string; topic: string; objectiveId: string | null; objectiveCode: string | null;
  objectiveTitle: string | null; scorePct: number | null; itemCount: number; ineligibleReason: string | null;
  questions: { text?: string; options?: string[]; correctIndex?: number }[]
}
type Measurement = {
  id: string; student_id: string; learning_objective_id: string; pre_session_id: string; post_session_id: string; studentName: string; objectiveCode: string; objectiveTitle: string;
  pre_score_pct: number; post_score_pct: number; gain_pp: number; item_count: number;
  pre_completed_at: string; post_completed_at: string; cycleTransferSessionId: string | null; transfer_session_id: string | null; transfer_score_pct: number | null; transfer_gain_pp: number | null
  measurement_version: string
}
type Data = {
  students: { id: string; name: string }[]; sessions: Session[]; measurements: Measurement[];
  summary: { pairedStudents: number; pairedObjectives: number; averageGainPp: number | null; minimumSummaryPairs: number };
  interpretation: string
}

export default function LearningGainPilot({ classrooms }: { classrooms: Classroom[] }) {
  const { t: tr, locale } = useT()
  const dl = intlLocale(locale)
  const [classroomId, setClassroomId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [preId, setPreId] = useState('')
  const [postId, setPostId] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const [transferForId, setTransferForId] = useState('')
  const [transferId, setTransferId] = useState('')
  const [transferReviewed, setTransferReviewed] = useState(false)
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  // The transfer form sits at the bottom of the card; its result must be shown next to it, not only at the top.
  const [transferStatus, setTransferStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [listOpen, setListOpen] = useState(false)
  const transferStatusRef = useRef<HTMLDivElement | null>(null)

  const effectiveClassroomId = classrooms.some(item => item.id === classroomId) ? classroomId : classrooms[0]?.id || ''

  const load = useCallback(async () => {
    if (!effectiveClassroomId) return
    setLoading(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error(tr('Oturum gerekli.'))
      const params = new URLSearchParams({ classroomId: effectiveClassroomId })
      if (studentId) params.set('studentId', studentId)
      const response = await fetch(`/api/teacher/learning-gain?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || tr('Ölçüm verisi alınamadı.'))
      setData(result)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr('Ölçüm verisi alınamadı.'))
    } finally {
      setLoading(false)
    }
  }, [effectiveClassroomId, studentId, tr])

  useEffect(() => {
    if (transferStatus) transferStatusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [transferStatus])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const eligible = (data?.sessions ?? []).filter(item => !item.ineligibleReason)
  const pre = eligible.find(item => item.id === preId)
  const post = eligible.find(item => item.id === postId)
  const postOptions = eligible.filter(item => item.id !== preId && item.objectiveId === pre?.objectiveId &&
    new Date(item.createdAt).getTime() > new Date(pre?.createdAt || '').getTime())
  const transferFor = data?.measurements.find(item => item.id === transferForId)
  const transferOptions = eligible.filter(item => item.objectiveId === transferFor?.learning_objective_id &&
    new Date(item.createdAt).getTime() > new Date(transferFor?.post_completed_at || '').getTime())
  const transfer = transferOptions.find(item => item.id === transferId)
  // A transfer test must not repeat any question of the measurement's pre or post test (the server rejects it).
  const referenceQuestions = [transferFor?.pre_session_id, transferFor?.post_session_id]
    .flatMap(id => (data?.sessions ?? []).find(item => item.id === id)?.questions ?? [])
  const repeatedQuestions = (item: Session) => sharedQuestionCount(referenceQuestions, item.questions)

  async function save() {
    if (!pre || !post || !studentId || !reviewed) return
    setSaving(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error(tr('Oturum gerekli.'))
      const response = await fetch('/api/teacher/learning-gain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ classroomId: effectiveClassroomId, studentId, objectiveId: pre.objectiveId, preSessionId: pre.id, postSessionId: post.id, reviewed }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || tr('Ölçüm kaydedilemedi.'))
      setReviewed(false)
      setPreId('')
      setPostId('')
      await load()
      setMessage(tr('Ölçüm kaydedildi: {gain} yüzde puan.', { gain: `${result.measurement.gain_pp >= 0 ? '+' : ''}${result.measurement.gain_pp}` }))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : tr('Ölçüm kaydedilemedi.'))
    } finally {
      setSaving(false)
    }
  }

  function transferBlocker(): string | null {
    if (!transferFor) return tr('Önce kaydedilmiş ölçümlerden “Aktarım testi ekle” ile bir ölçüm seçin.')
    if (!transfer) return tr('Aktarım testini listeden seçin.')
    if (!transferReviewed) return tr('Soruları inceleyip onay kutusunu işaretleyin.')
    return null
  }

  async function saveTransfer() {
    const blocker = transferBlocker()
    if (blocker || !transferFor || !transfer) { setTransferStatus({ kind: 'error', text: blocker ?? tr('Aktarım kaydedilemedi.') }); return }
    setSaving(true)
    setTransferStatus(null)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error(tr('Oturum gerekli. Sayfayı yenileyip tekrar giriş yapın.'))
      const response = await fetch('/api/teacher/learning-gain', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ classroomId: effectiveClassroomId, measurementId: transferFor.id, transferSessionId: transfer.id, reviewed: true }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || tr('Aktarım ölçümü kaydedilemedi (HTTP {status}).', { status: response.status }))
      setTransferForId('')
      setTransferId('')
      setTransferReviewed(false)
      await load()
      setListOpen(true)
      setTransferStatus({ kind: 'ok', text: tr('Aktarım ölçümü kaydedildi: başlangıca göre {gain} yüzde puan. Kayıt aşağıdaki listede güncellendi.', { gain: `${result.measurement.transfer_gain_pp >= 0 ? '+' : ''}${result.measurement.transfer_gain_pp}` }) })
    } catch (error) {
      setTransferStatus({ kind: 'error', text: error instanceof Error ? error.message : tr('Aktarım ölçümü kaydedilemedi.') })
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--text)', minWidth: 180, maxWidth: '100%' }
  return <section className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #3f8b70' }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{tr('📈 Öğrenme kazanımı pilotu')}</div>
    <p style={{ fontSize: 12, color: 'var(--text3)', margin: '5px 0 12px' }}>{tr('Aynı kazanım için farklı sorularla yapılmış ön ve son testi inceleyip eşleştirin. Sonuç yüzde puan farkıdır.')}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <select aria-label={tr('Sınıf‖sınıf grubu')} style={fieldStyle} value={effectiveClassroomId} onChange={event => { setClassroomId(event.target.value); setStudentId(''); setPreId(''); setPostId(''); setReviewed(false); setTransferForId(''); setData(null) }}>
        {classrooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select aria-label={tr('Öğrenci‖pilot')} style={fieldStyle} value={studentId} onChange={event => { setStudentId(event.target.value); setPreId(''); setPostId(''); setReviewed(false); setTransferForId('') }}>
        <option value="">{tr('Öğrenci seçin')}</option>
        {(data?.students ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <button className="btn" onClick={() => void load()} disabled={loading || !effectiveClassroomId}>{loading ? tr('Yükleniyor…') : tr('Yenile')}</button>
    </div>
    {message && <div role="status" style={{ fontSize: 12, marginBottom: 10, color: 'var(--text2)' }}>{message}</div>}
    {data && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
      {tr('{students} öğrenci · {pairs} öğrenci-kazanım çifti · ortalama fark: {avg}', { students: data.summary.pairedStudents, pairs: data.summary.pairedObjectives, avg: data.summary.averageGainPp === null ? tr('en az {n} çiftte gösterilir', { n: data.summary.minimumSummaryPairs }) : tr('{gain} yüzde puan', { gain: `${data.summary.averageGainPp >= 0 ? '+' : ''}${data.summary.averageGainPp}` }) })}
      <div style={{ marginTop: 3, color: 'var(--text3)' }}>{data.interpretation}</div>
    </div>}
    {studentId && <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <select aria-label={tr('Ön test')} style={fieldStyle} value={preId} onChange={event => { setPreId(event.target.value); setPostId(''); setReviewed(false) }}>
        <option value="">{tr('Ön test seçin')}</option>
        {eligible.map(item => <option key={item.id} value={item.id}>{tr('{date} · {code} · %{pct} · {n} soru', { date: new Date(item.createdAt).toLocaleDateString(dl), code: item.objectiveCode, pct: item.scorePct ?? '', n: item.itemCount })}</option>)}
      </select>
      <select aria-label={tr('Son test')} style={fieldStyle} value={postId} onChange={event => { setPostId(event.target.value); setReviewed(false) }} disabled={!pre}>
        <option value="">{tr('Son test seçin')}</option>
        {postOptions.map(item => <option key={item.id} value={item.id}>{tr('{date} · {code} · %{pct} · {n} soru', { date: new Date(item.createdAt).toLocaleDateString(dl), code: item.objectiveCode, pct: item.scorePct ?? '', n: item.itemCount })}</option>)}
      </select>
      {!eligible.length && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{tr('Bu öğrenci için ölçüme uygun, doğrulanmış test henüz yok.')}</span>}
      {pre && post && <>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{pre.objectiveCode} · {pre.objectiveTitle}: %{pre.scorePct} → %{post.scorePct}</div>
        {([[tr('Ön test'), pre], [tr('Son test'), post]] as const).map(([label, item]) => <details key={item.id} style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{tr('{label} sorularını incele ({n})', { label, n: item.itemCount })}</summary>
          <ol style={{ paddingLeft: 20 }}>{item.questions.map((question, index) => <li key={index} style={{ marginTop: 8 }}><MathText text={question.text} />
            {Array.isArray(question.options) && <div style={{ color: 'var(--text3)' }}>{tr('Doğru yanıt:')} <MathText text={question.options[question.correctIndex ?? -1] ?? '—'} /></div>}
          </li>)}</ol>
        </details>)}
        <label style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12 }}>
          <input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />
          {tr('Her iki testin sorularını, yanıtlarını ve kazanımla eşleşmesini inceledim.')}
        </label>
        <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!reviewed || saving} onClick={() => void save()}>{saving ? tr('Kaydediliyor…') : tr('Ölçümü kaydet')}</button>
      </>}
    </div>}
    {!!data?.measurements.length && <details open={listOpen} onToggle={event => setListOpen((event.currentTarget as HTMLDetailsElement).open)} style={{ fontSize: 12 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>{tr('Kaydedilmiş ölçümler ({n})', { n: data.measurements.length })}</summary>
      <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>{data.measurements.map(item => <div key={item.id} style={{ padding: '7px 0', borderTop: '1px solid var(--border)' }}>
        {item.studentName} · {item.objectiveCode} · {new Date(item.pre_completed_at).toLocaleDateString(dl, { day: '2-digit', month: '2-digit' })} %{item.pre_score_pct} → {new Date(item.post_completed_at).toLocaleDateString(dl, { day: '2-digit', month: '2-digit' })} %{item.post_score_pct} · <strong>{tr('{gain} puan', { gain: `${Number(item.gain_pp) >= 0 ? '+' : ''}${item.gain_pp}` })}</strong>
        {item.measurement_version === 'learning-gain-v2-server-scored-transfer' ? ` · ${tr('sunucuda puanlanmış, öğretmen incelemeli')}` : ` · ${tr('betimleyici pilot')}`}
        {item.transfer_session_id ? ` · ${tr('aktarım %{pct} (başlangıca göre {gain} puan)', { pct: item.transfer_score_pct ?? '', gain: `${Number(item.transfer_gain_pp) >= 0 ? '+' : ''}${item.transfer_gain_pp}` })}` : ` · ${tr('aktarım bekleniyor')}`}
        {!item.transfer_session_id && !item.cycleTransferSessionId && <span style={{ color: 'var(--text3)' }}> · {tr('bu ölçümün döngüsünde tamamlanmış aktarım testi yok')}</span>}
        {!item.transfer_session_id && studentId === item.student_id && <button className="btn" style={{ marginLeft: 8 }} onClick={() => { setTransferForId(item.id); setTransferId(item.cycleTransferSessionId ?? ''); setTransferReviewed(false); setTransferStatus(null) }}>{item.cycleTransferSessionId ? tr('Aktarım testi ekle (önerilen test hazır)') : tr('Aktarım testi ekle')}</button>}
      </div>)}</div>
    </details>}
    {transferStatus && <div ref={transferStatusRef} role={transferStatus.kind === 'error' ? 'alert' : 'status'} style={{
      marginTop: 10, padding: '8px 10px', borderRadius: 8, fontSize: 12,
      background: transferStatus.kind === 'ok' ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.1)', color: transferStatus.kind === 'ok' ? '#15803d' : '#b91c1c' }}>
      {transferStatus.kind === 'ok' ? '✓ ' : '✕ '}{transferStatus.text}</div>}
    {transferFor && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12, display: 'grid', gap: 8, fontSize: 12 }}>
      <strong>{tr('{student} · {code} aktarım ölçümü', { student: transferFor.studentName, code: transferFor.objectiveCode })}</strong>
      <select aria-label={tr('Aktarım testi')} style={fieldStyle} value={transferId} onChange={event => { setTransferId(event.target.value); setTransferReviewed(false) }}>
        <option value="">{tr('Aktarım testi seçin')}</option>
        {transferOptions.map(item => {
          const repeated = repeatedQuestions(item)
          return <option key={item.id} value={item.id} disabled={repeated > 0}>
            {new Date(item.createdAt).toLocaleString(dl, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · %{item.scorePct} · {tr('{n} soru', { n: item.itemCount })}{item.id === transferFor?.cycleTransferSessionId ? ` · ${tr('★ bu ölçümün döngüsünün aktarım testi')}` : ''}{repeated > 0 ? ` · ${tr('✕ ön/son testle {n} aynı soru', { n: repeated })}` : ''}
          </option>
        })}
      </select>
      {transferOptions.length > 0 && transferOptions.every(item => repeatedQuestions(item) > 0) && <div style={{ color: '#b45309' }}>{tr('Bu ölçüm için uygun aktarım testi yok: listedeki testlerin hepsi ön/son testle aynı soruları içeriyor. Aktarım için farklı sorulardan oluşan yeni bir test gerekir.')}</div>}
      {transfer && <details style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
        <summary style={{ cursor: 'pointer' }}>{tr('Aktarım sorularını incele ({n})', { n: transfer.itemCount })}</summary>
        <ol style={{ paddingLeft: 20 }}>{transfer.questions.map((question, index) => <li key={index} style={{ marginTop: 8 }}><MathText text={question.text} />
          {Array.isArray(question.options) && <div style={{ color: 'var(--text3)' }}>{tr('Doğru yanıt:')} <MathText text={question.options[question.correctIndex ?? -1] ?? '—'} /></div>}
        </li>)}</ol>
      </details>}
      {transfer && <label style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}><input type="checkbox" checked={transferReviewed} onChange={event => setTransferReviewed(event.target.checked)} />{tr('Soruların aynı kazanımı yeni bir durumda ölçtüğünü ve cevap anahtarını inceledim.')}</label>}
      {transferBlocker() && <div style={{ color: 'var(--text3)' }}>{tr('Kaydetmek için: {reason}', { reason: transferBlocker() ?? '' })}</div>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" aria-disabled={Boolean(transferBlocker()) || saving} disabled={saving} style={transferBlocker() ? { opacity: 0.55 } : undefined} onClick={() => void saveTransfer()}>{saving ? tr('Kaydediliyor…') : tr('Aktarımı kaydet')}</button><button className="btn" onClick={() => setTransferForId('')}>{tr('Vazgeç')}</button></div>
    </div>}
    <LearningEvidenceChain classroomId={effectiveClassroomId} studentId={studentId} />
    <VerifiedLearningPlans classroomId={effectiveClassroomId} studentId={studentId} />
  </section>
}
