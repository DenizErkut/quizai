'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Assignment = { id: string; classroom_id: string; title: string; question: string; rubric: Array<{ criterion: string; maxPoints: number }> }
type Student = { id: string; schoolNo: string | null; fullName: string; classroomId?: string }
type Answer = { index: number; assignmentId: string; text: string; legible: boolean; note: string }
type Result = { assignmentId: string; index: number; answered: boolean; totalEarned: number; totalPossible: number; criteriaResults: Array<{ criterion: string; maxPoints: number; earnedPoints: number; feedback: string }>; overallFeedback: string }

// Phone photos are 3-8 MB; the request limit is ~4.5 MB. A 1800 px JPEG keeps handwriting legible at ~300-600 KB.
async function compress(file: File): Promise<{ mediaType: 'image/jpeg'; data: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return { mediaType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1] }
}

export default function PaperAnswerImport({ group, onClose }: { group: Assignment[]; onClose: () => void }) {
  const supabase = createClient() as any
  const [students, setStudents] = useState<Student[]>([])
  const [studentId, setStudentId] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [answers, setAnswers] = useState<Answer[] | null>(null)
  const [results, setResults] = useState<Result[] | null>(null)
  const [scores, setScores] = useState<Record<string, number[]>>({})
  const [info, setInfo] = useState<{ codeMatches: boolean | null; sheetCode: string | null; expectedCode: string; studentNameOnPaper: string | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const ids = group.map(item => item.id)

  async function call(body: Record<string, unknown>) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/teacher/import-paper-answers', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ assignment_ids: ids, student_id: studentId, ...body }),
    })
    const data = await res.json().catch(() => null)
    return { ok: res.ok, status: res.status, data }
  }

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/teacher/students-roster', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      const data = await res.json().catch(() => null)
      setStudents((data?.students || []).filter((student: Student) => student.classroomId === group[0].classroom_id))
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function transcribe() {
    if (!studentId || !files.length) return
    setBusy(true); setMessage('Kâğıt okunuyor… (20-60 saniye sürebilir)')
    try {
      const images = await Promise.all(files.slice(0, 6).map(compress))
      const { ok, data } = await call({ action: 'transcribe', images })
      if (!ok) { setMessage(data?.error || 'Kâğıt okunamadı.'); return }
      setAnswers(data.answers); setInfo({ codeMatches: data.codeMatches, sheetCode: data.sheetCode, expectedCode: data.expectedCode, studentNameOnPaper: data.studentNameOnPaper })
      setMessage('')
    } catch { setMessage('Görseller işlenemedi. JPEG/PNG fotoğraf seçin.') }
    finally { setBusy(false) }
  }

  async function save(replace = false) {
    if (!answers) return
    setBusy(true); setMessage('Cevaplar puanlanıyor…')
    try {
      const { ok, status, data } = await call({ action: 'save', replace, answers: answers.map(item => ({ assignmentId: item.assignmentId, text: item.text })) })
      if (status === 409 && !replace) {
        if (confirm(`${data?.error}\n\nÜzerine yazılsın mı?`)) { setBusy(false); return save(true) }
        setMessage('Kaydedilmedi.'); return
      }
      if (!ok) { setMessage(data?.error || 'Kaydedilemedi.'); return }
      setResults(data.results)
      setScores(Object.fromEntries(data.results.map((result: Result) => [result.assignmentId, result.criteriaResults.map(c => c.earnedPoints)])))
      setMessage('')
    } catch { setMessage('Beklenmeyen bir hata oluştu.') }
    finally { setBusy(false) }
  }

  async function adjust(result: Result) {
    setBusy(true)
    try {
      const { ok, data } = await call({ action: 'adjust', assignment_ids: [result.assignmentId], scores: scores[result.assignmentId] })
      if (!ok) { setMessage(data?.error || 'Puan kaydedilemedi.'); return }
      setResults(prev => prev && prev.map(item => item.assignmentId === result.assignmentId ? { ...item, criteriaResults: data.criteriaResults, totalEarned: data.totalEarned } : item))
      setMessage('Puanlar güncellendi.')
    } finally { setBusy(false) }
  }

  const student = students.find(item => item.id === studentId)
  return (
    <div className="card" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>📥 Kâğıt cevapları içe aktar — öğrenci bazında</strong>
        <button className="btn btn-sm" onClick={onClose}>Kapat</button>
      </div>
      {!answers && <>
        <select value={studentId} onChange={event => setStudentId(event.target.value)} aria-label="Öğrenci seç">
          <option value="">Öğrenci seç…</option>
          {students.map(item => <option key={item.id} value={item.id}>{item.schoolNo ? `${item.schoolNo} — ` : ''}{item.fullName}</option>)}
        </select>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => setFiles(Array.from(event.target.files || []))} aria-label="Cevap kâğıdı fotoğrafları" />
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>Bu öğrencinin doldurduğu kâğıdın tüm sayfalarını (en fazla 6 fotoğraf) yükleyin. Fotoğraflar yalnızca okunmak için işlenir, saklanmaz.</div>
        <button className="btn btn-primary" disabled={busy || !studentId || !files.length} onClick={() => void transcribe()}>{busy ? '⏳ Okunuyor…' : 'Kâğıdı oku'}</button>
      </>}
      {answers && !results && <>
        <div style={{ fontSize: 12 }}>Öğrenci: <strong>{student?.fullName}</strong>{info?.studentNameOnPaper ? ` · kâğıtta yazan ad: ${info.studentNameOnPaper}` : ''}</div>
        {info?.codeMatches === false && <div role="alert" style={{ padding: 8, background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 8, fontSize: 12 }}>⚠️ Kâğıttaki ödev kodu ({info.sheetCode}) bu ödevin kodundan ({info.expectedCode}) farklı. Doğru ödevi seçtiğinizden emin olun.</div>}
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Okunan cevapları kontrol edin; hatalı okunanları düzeltin. Puanlama bundan sonra yapılır.</div>
        {answers.map((item, index) => (
          <div key={item.assignmentId}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Soru {index + 1}: {group[index]?.question.slice(0, 140)}</div>
            <textarea value={item.text} rows={4} onChange={event => setAnswers(prev => prev && prev.map(x => x.index === index ? { ...x, text: event.target.value } : x))} style={{ width: '100%' }} aria-label={`Soru ${index + 1} cevabı`} />
            {(!item.legible || item.note) && <div style={{ fontSize: 11, color: 'var(--amber, #b45309)' }}>⚠️ {item.note || 'Bazı kısımlar zor okundu; kontrol edin.'}</div>}
            {!item.text.trim() && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Cevap bulunamadı — 0 puan verilir.</div>}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => { setAnswers(null); setInfo(null) }}>← Yeniden yükle</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void save()} style={{ flex: 1 }}>{busy ? '⏳ Puanlanıyor…' : '✓ Onayla ve puanla'}</button>
        </div>
      </>}
      {results && <>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>✓ {student?.fullName}: toplam {results.reduce((sum, item) => sum + item.totalEarned, 0)} / {results.reduce((sum, item) => sum + item.totalPossible, 0)} puan kaydedildi</div>
        {results.map(result => (
          <div key={result.assignmentId} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Soru {result.index + 1}: {result.totalEarned} / {result.totalPossible}{result.answered ? '' : ' (cevap yok)'}</div>
            {result.criteriaResults.map((criterion, index) => (
              <label key={index} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 11, margin: '3px 0' }}>
                <input type="number" min={0} max={criterion.maxPoints} value={scores[result.assignmentId]?.[index] ?? criterion.earnedPoints} style={{ width: 56 }}
                  onChange={event => setScores(prev => ({ ...prev, [result.assignmentId]: result.criteriaResults.map((c, i) => i === index ? Number(event.target.value) : (prev[result.assignmentId]?.[i] ?? c.earnedPoints)) }))} />
                / {criterion.maxPoints} — {criterion.criterion}{criterion.feedback ? ` · ${criterion.feedback}` : ''}
              </label>
            ))}
            <button className="btn btn-sm" disabled={busy} onClick={() => void adjust(result)}>Puanları kaydet</button>
          </div>
        ))}
        <button className="btn" onClick={() => { setAnswers(null); setResults(null); setFiles([]); setStudentId(''); setMessage('') }}>Başka öğrenci aktar</button>
      </>}
      {message && <div role="status" style={{ fontSize: 12, color: 'var(--text2)' }}>{message}</div>}
    </div>
  )
}
