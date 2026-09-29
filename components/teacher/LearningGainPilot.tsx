'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Classroom = { id: string; name: string }
type Session = {
  id: string; createdAt: string; topic: string; objectiveId: string | null; objectiveCode: string | null;
  objectiveTitle: string | null; scorePct: number | null; itemCount: number; ineligibleReason: string | null;
  questions: { text?: string; options?: string[]; correctIndex?: number }[]
}
type Measurement = {
  id: string; student_id: string; learning_objective_id: string; studentName: string; objectiveCode: string; objectiveTitle: string;
  pre_score_pct: number; post_score_pct: number; gain_pp: number; item_count: number;
  post_completed_at: string; transfer_session_id: string | null; transfer_score_pct: number | null; transfer_gain_pp: number | null
}
type Data = {
  students: { id: string; name: string }[]; sessions: Session[]; measurements: Measurement[];
  summary: { pairedStudents: number; pairedObjectives: number; averageGainPp: number | null; minimumSummaryPairs: number };
  interpretation: string
}

export default function LearningGainPilot({ classrooms }: { classrooms: Classroom[] }) {
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

  const effectiveClassroomId = classrooms.some(item => item.id === classroomId) ? classroomId : classrooms[0]?.id || ''

  const load = useCallback(async () => {
    if (!effectiveClassroomId) return
    setLoading(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error('Oturum gerekli.')
      const params = new URLSearchParams({ classroomId: effectiveClassroomId })
      if (studentId) params.set('studentId', studentId)
      const response = await fetch(`/api/teacher/learning-gain?${params}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Ölçüm verisi alınamadı.')
      setData(result)
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ölçüm verisi alınamadı.')
    } finally {
      setLoading(false)
    }
  }, [effectiveClassroomId, studentId])

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

  async function save() {
    if (!pre || !post || !studentId || !reviewed) return
    setSaving(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error('Oturum gerekli.')
      const response = await fetch('/api/teacher/learning-gain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ classroomId: effectiveClassroomId, studentId, objectiveId: pre.objectiveId, preSessionId: pre.id, postSessionId: post.id, reviewed }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Ölçüm kaydedilemedi.')
      setReviewed(false)
      setPreId('')
      setPostId('')
      await load()
      setMessage(`Ölçüm kaydedildi: ${result.measurement.gain_pp >= 0 ? '+' : ''}${result.measurement.gain_pp} yüzde puan.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ölçüm kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  async function saveTransfer() {
    if (!transferFor || !transfer || !transferReviewed) return
    setSaving(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error('Oturum gerekli.')
      const response = await fetch('/api/teacher/learning-gain', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ classroomId: effectiveClassroomId, measurementId: transferFor.id, transferSessionId: transfer.id, reviewed: true }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Aktarım ölçümü kaydedilemedi.')
      setTransferForId('')
      setTransferId('')
      setTransferReviewed(false)
      await load()
      setMessage(`Aktarım ölçümü kaydedildi: başlangıca göre ${result.measurement.transfer_gain_pp >= 0 ? '+' : ''}${result.measurement.transfer_gain_pp} yüzde puan.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Aktarım ölçümü kaydedilemedi.')
    } finally {
      setSaving(false)
    }
  }

  const fieldStyle = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg2)', color: 'var(--text)', minWidth: 180, maxWidth: '100%' }
  return <section className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #3f8b70' }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>📈 Öğrenme kazanımı pilotu</div>
    <p style={{ fontSize: 12, color: 'var(--text3)', margin: '5px 0 12px' }}>Aynı kazanım için farklı sorularla yapılmış ön ve son testi inceleyip eşleştirin. Sonuç yüzde puan farkıdır.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      <select aria-label="Sınıf" style={fieldStyle} value={effectiveClassroomId} onChange={event => { setClassroomId(event.target.value); setStudentId(''); setPreId(''); setPostId(''); setReviewed(false); setTransferForId(''); setData(null) }}>
        {classrooms.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select aria-label="Öğrenci" style={fieldStyle} value={studentId} onChange={event => { setStudentId(event.target.value); setPreId(''); setPostId(''); setReviewed(false); setTransferForId('') }}>
        <option value="">Öğrenci seçin</option>
        {(data?.students ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <button className="btn" onClick={() => void load()} disabled={loading || !effectiveClassroomId}>{loading ? 'Yükleniyor…' : 'Yenile'}</button>
    </div>
    {message && <div role="status" style={{ fontSize: 12, marginBottom: 10, color: 'var(--text2)' }}>{message}</div>}
    {data && <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>
      {data.summary.pairedStudents} öğrenci · {data.summary.pairedObjectives} öğrenci-kazanım çifti · ortalama fark: {data.summary.averageGainPp === null ? `en az ${data.summary.minimumSummaryPairs} çiftte gösterilir` : `${data.summary.averageGainPp >= 0 ? '+' : ''}${data.summary.averageGainPp} yüzde puan`}
      <div style={{ marginTop: 3, color: 'var(--text3)' }}>{data.interpretation}</div>
    </div>}
    {studentId && <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <select aria-label="Ön test" style={fieldStyle} value={preId} onChange={event => { setPreId(event.target.value); setPostId(''); setReviewed(false) }}>
        <option value="">Ön test seçin</option>
        {eligible.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleDateString('tr-TR')} · {item.objectiveCode} · %{item.scorePct} · {item.itemCount} soru</option>)}
      </select>
      <select aria-label="Son test" style={fieldStyle} value={postId} onChange={event => { setPostId(event.target.value); setReviewed(false) }} disabled={!pre}>
        <option value="">Son test seçin</option>
        {postOptions.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleDateString('tr-TR')} · {item.objectiveCode} · %{item.scorePct} · {item.itemCount} soru</option>)}
      </select>
      {!eligible.length && <span style={{ fontSize: 12, color: 'var(--text3)' }}>Bu öğrenci için ölçüme uygun, doğrulanmış test henüz yok.</span>}
      {pre && post && <>
        <div style={{ fontSize: 12, fontWeight: 700 }}>{pre.objectiveCode} · {pre.objectiveTitle}: %{pre.scorePct} → %{post.scorePct}</div>
        {([['Ön test', pre], ['Son test', post]] as const).map(([label, item]) => <details key={item.id} style={{ fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{label} sorularını incele ({item.itemCount})</summary>
          <ol style={{ paddingLeft: 20 }}>{item.questions.map((question, index) => <li key={index} style={{ marginTop: 8 }}>{question.text}
            {Array.isArray(question.options) && <div style={{ color: 'var(--text3)' }}>Doğru yanıt: {question.options[question.correctIndex ?? -1] ?? '—'}</div>}
          </li>)}</ol>
        </details>)}
        <label style={{ display: 'flex', gap: 7, alignItems: 'flex-start', fontSize: 12 }}>
          <input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />
          Her iki testin sorularını, yanıtlarını ve kazanımla eşleşmesini inceledim.
        </label>
        <button className="btn btn-primary" style={{ justifySelf: 'start' }} disabled={!reviewed || saving} onClick={() => void save()}>{saving ? 'Kaydediliyor…' : 'Ölçümü kaydet'}</button>
      </>}
    </div>}
    {!!data?.measurements.length && <details style={{ fontSize: 12 }}><summary style={{ cursor: 'pointer', fontWeight: 700 }}>Kaydedilmiş ölçümler ({data.measurements.length})</summary>
      <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8 }}>{data.measurements.map(item => <div key={item.id} style={{ padding: '7px 0', borderTop: '1px solid var(--border)' }}>
        {item.studentName} · {item.objectiveCode} · %{item.pre_score_pct} → %{item.post_score_pct} · <strong>{Number(item.gain_pp) >= 0 ? '+' : ''}{item.gain_pp} puan</strong>
        {item.transfer_session_id ? ` · aktarım %${item.transfer_score_pct} (başlangıca göre ${Number(item.transfer_gain_pp) >= 0 ? '+' : ''}${item.transfer_gain_pp} puan)` : ' · aktarım bekleniyor'}
        {!item.transfer_session_id && studentId === item.student_id && <button className="btn" style={{ marginLeft: 8 }} onClick={() => { setTransferForId(item.id); setTransferId(''); setTransferReviewed(false) }}>Aktarım testi ekle</button>}
      </div>)}</div>
    </details>}
    {transferFor && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12, display: 'grid', gap: 8, fontSize: 12 }}>
      <strong>{transferFor.studentName} · {transferFor.objectiveCode} aktarım ölçümü</strong>
      <select aria-label="Aktarım testi" style={fieldStyle} value={transferId} onChange={event => { setTransferId(event.target.value); setTransferReviewed(false) }}>
        <option value="">Aktarım testi seçin</option>
        {transferOptions.map(item => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleDateString('tr-TR')} · %{item.scorePct} · {item.itemCount} soru</option>)}
      </select>
      {transfer && <details style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
        <summary style={{ cursor: 'pointer' }}>Aktarım sorularını incele ({transfer.itemCount})</summary>
        <ol style={{ paddingLeft: 20 }}>{transfer.questions.map((question, index) => <li key={index} style={{ marginTop: 8 }}>{question.text}
          {Array.isArray(question.options) && <div style={{ color: 'var(--text3)' }}>Doğru yanıt: {question.options[question.correctIndex ?? -1] ?? '—'}</div>}
        </li>)}</ol>
      </details>}
      {transfer && <label style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}><input type="checkbox" checked={transferReviewed} onChange={event => setTransferReviewed(event.target.checked)} />Soruların aynı kazanımı yeni bir durumda ölçtüğünü ve cevap anahtarını inceledim.</label>}
      <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" disabled={!transfer || !transferReviewed || saving} onClick={() => void saveTransfer()}>Aktarımı kaydet</button><button className="btn" onClick={() => setTransferForId('')}>Vazgeç</button></div>
    </div>}
  </section>
}
