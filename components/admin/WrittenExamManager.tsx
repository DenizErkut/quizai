'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LocationSelect from '@/components/LocationSelect'
import type { LocationValue } from '@/lib/location/validate'

type Criterion = { criterion: string; maxPoints: number; description: string }
type Question = { title: string; objectiveCode: string; scenario: string; question: string; maxPoints: number; rubric: Criterion[]; answerKey: string }
type SetRow = { id: string; title: string; grade_number: number; subject: string; term: number; exam_number: number; country: string; state: string | null; city: string | null; status: string; total_points: number; question_count: number }

const emptyQuestion = (): Question => ({ title: '', objectiveCode: '', scenario: '', question: '', maxPoints: 8, rubric: [{ criterion: 'a)', maxPoints: 8, description: '' }], answerKey: '' })
const field: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }
const rubricSum = (q: Question) => q.rubric.reduce((sum, item) => sum + (Number(item.maxPoints) || 0), 0)

export default function WrittenExamManager() {
  const [sets, setSets] = useState<SetRow[]>([])
  const [editing, setEditing] = useState(false)
  const [setId, setSetId] = useState('')
  const [title, setTitle] = useState('')
  const [gradeNumber, setGradeNumber] = useState(6)
  const [subject, setSubject] = useState('')
  const [term, setTerm] = useState(1)
  const [examNumber, setExamNumber] = useState(1)
  const [scope, setScope] = useState<LocationValue>({ country: 'TR', state: '', city: '' })
  const [sourceNote, setSourceNote] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [warnings, setWarnings] = useState<string[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const authHeader = async () => {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Yönetici oturumu gerekli.')
    return { Authorization: `Bearer ${session.access_token}` }
  }

  const loadSets = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/written-exam', { headers: await authHeader(), cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Setler yüklenemedi.')
      setSets(data.sets)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Setler yüklenemedi.') }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSets() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSets])

  function startNew() {
    setSetId(''); setTitle(''); setSubject(''); setSourceNote(''); setQuestions([]); setWarnings([]); setFile(null); setMessage('')
    setScope({ country: 'TR', state: '', city: '' }); setEditing(true)
  }

  async function openSet(id: string) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/admin/written-exam?id=${id}`, { headers: await authHeader(), cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Set açılamadı.')
      const s = data.set as SetRow & { source_note: string | null }
      setSetId(s.id); setTitle(s.title); setGradeNumber(s.grade_number); setSubject(s.subject); setTerm(s.term); setExamNumber(s.exam_number)
      setScope({ country: s.country, state: s.state || '', city: s.city || '' }); setSourceNote(s.source_note || ''); setFile(null); setWarnings([])
      setQuestions((data.questions as Array<Record<string, unknown>>).map(q => ({
        title: String(q.title || ''), objectiveCode: String(q.objective_code || ''), scenario: String(q.scenario || ''), question: String(q.question || ''),
        maxPoints: Number(q.max_points) || 0, rubric: (q.rubric as Criterion[]) || [], answerKey: String(q.answer_key || ''),
      })))
      setEditing(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Set açılamadı.') }
    finally { setBusy(false) }
  }

  async function parseFile() {
    if (!file) { setMessage('Önce bir PDF veya metin dosyası seçin.'); return }
    setBusy(true); setMessage('Dosya okunuyor ve sorular ayıklanıyor (1-2 dakika sürebilir)…')
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/admin/written-exam/parse', { method: 'POST', headers: await authHeader(), body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Dosya işlenemedi.')
      setQuestions(data.questions); setWarnings(data.warnings || [])
      setMessage(`${data.questions.length} soru ayıklandı. Kaydetmeden önce her soruyu ve rubriği kontrol edin.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Dosya işlenemedi.') }
    finally { setBusy(false) }
  }

  async function save(publish: boolean) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/written-exam', {
        method: 'POST', headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: setId || undefined, title, gradeNumber, subject, term, examNumber, ...scope, sourceNote, publish, questions }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kayıt başarısız.')
      setMessage(`Kaydedildi: ${data.questionCount} soru, ${data.totalPoints} puan (${data.status === 'published' ? 'yayında' : 'taslak'}).`)
      setEditing(false); await loadSets()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kayıt başarısız.') }
    finally { setBusy(false) }
  }

  async function toggle(set: SetRow) {
    const status = set.status === 'published' ? 'draft' : 'published'
    const response = await fetch('/api/admin/written-exam', { method: 'PATCH', headers: { ...(await authHeader()), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: set.id, status }) })
    if (!response.ok) setMessage((await response.json()).error || 'Durum değiştirilemedi.')
    await loadSets()
  }

  async function printSet(set: SetRow, withKey: boolean) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(`/api/admin/written-exam?id=${set.id}`, { headers: await authHeader(), cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Set açılamadı.')
      const items = (data.questions as Array<Record<string, unknown>>).map(q => ({
        position: Number(q.position), title: String(q.title || ''), scenario: String(q.scenario || ''), question: String(q.question || ''),
        maxPoints: Number(q.max_points) || 0, rubric: (q.rubric as Criterion[]) || [], answerKey: String(q.answer_key || ''),
      }))
      const [{ writtenExamStudentSheetHtml, writtenExamTeacherKeyHtml, writtenSheetCode }, { printLearningDocument }] = await Promise.all([import('@/lib/written-exam-print'), import('@/lib/learning-print')])
      const code = writtenSheetCode(set.id)
      const meta = `${set.grade_number}. sınıf · ${set.subject} · ${set.term}. dönem · ${set.exam_number}. yazılı`
      await printLearningDocument(set.title, meta, writtenExamStudentSheetHtml(items, { code, meta }) + (withKey ? writtenExamTeacherKeyHtml(items, { code }) : ''))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Yazdırma görünümü açılamadı.') }
    finally { setBusy(false) }
  }

  async function remove(set: SetRow) {
    if (!window.confirm(`"${set.title}" ve tüm öğrenci denemeleri silinsin mi?`)) return
    const response = await fetch('/api/admin/written-exam', { method: 'DELETE', headers: { ...(await authHeader()), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: set.id }) })
    if (!response.ok) setMessage((await response.json()).error || 'Silinemedi.')
    await loadSets()
  }

  const patchQuestion = (index: number, patch: Partial<Question>) => setQuestions(list => list.map((q, i) => i === index ? { ...q, ...patch } : q))
  const patchCriterion = (qi: number, ci: number, patch: Partial<Criterion>) => setQuestions(list => list.map((q, i) => i !== qi ? q : { ...q, rubric: q.rubric.map((c, j) => j === ci ? { ...c, ...patch } : c) }))
  const total = questions.reduce((sum, q) => sum + (Number(q.maxPoints) || 0), 0)

  if (!editing) {
    return (
      <div>
        {message && <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>{message}</p>}
        <button className="btn btn-primary" onClick={startNew} style={{ marginBottom: 14 }}>+ Yeni yazılı seti</button>
        {sets.length === 0 ? <p style={{ color: 'var(--text2)', fontSize: 13 }}>Henüz set yok.</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {sets.map(set => (
              <div key={set.id} className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700 }}>{set.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{set.grade_number}. sınıf · {set.subject} · {set.term}. dönem · {set.exam_number}. yazılı · {set.country}{set.state ? ` / ${set.state}` : ''} · {set.question_count} soru, {set.total_points} puan</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: set.status === 'published' ? '#0a9e90' : 'var(--text2)' }}>{set.status === 'published' ? 'Yayında' : 'Taslak'}</span>
                <button className="btn btn-ghost" onClick={() => openSet(set.id)} disabled={busy}>Düzenle</button>
                <button className="btn btn-ghost" onClick={() => printSet(set, false)} disabled={busy}>🖨️ Yazdır</button>
                <button className="btn btn-ghost" onClick={() => printSet(set, true)} disabled={busy}>🖨️ Anahtarlı</button>
                <button className="btn btn-ghost" onClick={() => toggle(set)}>{set.status === 'published' ? 'Taslağa al' : 'Yayınla'}</button>
                <button className="btn btn-ghost" onClick={() => remove(set)}>Sil</button>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <label style={{ fontSize: 12 }}>Sınıf<select style={field} value={gradeNumber} onChange={e => setGradeNumber(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}. sınıf</option>)}</select></label>
          <label style={{ fontSize: 12 }}>Ders<input style={field} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Fen Bilimleri" /></label>
          <label style={{ fontSize: 12 }}>Dönem<select style={field} value={term} onChange={e => setTerm(Number(e.target.value))}><option value={1}>1. dönem</option><option value={2}>2. dönem</option></select></label>
          <label style={{ fontSize: 12 }}>Kaçıncı yazılı<select style={field} value={examNumber} onChange={e => setExamNumber(Number(e.target.value))}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}. yazılı</option>)}</select></label>
        </div>
        <label style={{ fontSize: 12 }}>Başlık (boşsa otomatik)<input style={field} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <div><div style={{ fontSize: 12, marginBottom: 4 }}>Ülke (zorunlu) / eyalet / şehir (opsiyonel)</div><LocationSelect value={scope} onChange={setScope} optionalPlaces /></div>
        <label style={{ fontSize: 12 }}>Kaynak notu<input style={field} value={sourceNote} onChange={e => setSourceNote(e.target.value)} placeholder="Örn. MEB örnek sorularından uyarlanmıştır" /></label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" accept=".pdf,.txt,.md" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button className="btn btn-ghost" onClick={parseFile} disabled={busy || !file}>Dosyadan soruları ayıkla</button>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>Öğrenci sayfaları + öğretmen cevap anahtarı aynı dosyada olmalı. Yapay zeka soru üretmez, yalnızca ayıklar.</span>
        </div>
      </div>
      {message && <p style={{ fontSize: 13, color: 'var(--text2)' }}>{message}</p>}
      {warnings.length > 0 && <ul style={{ fontSize: 12, color: '#b45309', paddingLeft: 18 }}>{warnings.map(w => <li key={w}>{w}</li>)}</ul>}

      {questions.map((q, qi) => {
        const sum = rubricSum(q)
        return (
          <div key={qi} className="card" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <strong>{qi + 1}. soru</strong>
              <input style={{ ...field, flex: 1 }} value={q.title} onChange={e => patchQuestion(qi, { title: e.target.value })} placeholder="Başlık" />
              <input style={{ ...field, width: 120 }} value={q.objectiveCode} onChange={e => patchQuestion(qi, { objectiveCode: e.target.value })} placeholder="Kazanım kodu" />
              <input style={{ ...field, width: 70 }} type="number" min={1} max={100} value={q.maxPoints} onChange={e => patchQuestion(qi, { maxPoints: Number(e.target.value) })} />
              <span style={{ fontSize: 12 }}>puan</span>
              <button className="btn btn-ghost" onClick={() => setQuestions(list => list.filter((_, i) => i !== qi))}>Sil</button>
            </div>
            <textarea style={{ ...field, minHeight: 50 }} value={q.scenario} onChange={e => patchQuestion(qi, { scenario: e.target.value })} placeholder="Ortak bağlam / tablo (varsa)" />
            <textarea style={{ ...field, minHeight: 80 }} value={q.question} onChange={e => patchQuestion(qi, { question: e.target.value })} placeholder="Soru metni (a, b, c alt maddeleriyle)" />
            <div style={{ fontSize: 12, fontWeight: 700, color: sum === Number(q.maxPoints) ? '#0a9e90' : '#c0392b' }}>Rubrik: {sum} / {q.maxPoints} puan</div>
            {q.rubric.map((c, ci) => (
              <div key={ci} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <input style={{ ...field, width: 150 }} value={c.criterion} onChange={e => patchCriterion(qi, ci, { criterion: e.target.value })} placeholder="Ölçüt" />
                <input style={{ ...field, width: 60 }} type="number" min={1} max={100} value={c.maxPoints} onChange={e => patchCriterion(qi, ci, { maxPoints: Number(e.target.value) })} />
                <textarea style={{ ...field, flex: 1, minHeight: 40 }} value={c.description} onChange={e => patchCriterion(qi, ci, { description: e.target.value })} placeholder="Beklenen doğru yanıt ve puan dağılımı" />
                <button className="btn btn-ghost" onClick={() => setQuestions(list => list.map((x, i) => i !== qi ? x : { ...x, rubric: x.rubric.filter((_, j) => j !== ci) }))}>×</button>
              </div>
            ))}
            <div><button className="btn btn-ghost" onClick={() => setQuestions(list => list.map((x, i) => i !== qi ? x : { ...x, rubric: [...x.rubric, { criterion: '', maxPoints: 1, description: '' }] }))}>+ Ölçüt</button></div>
            <textarea style={{ ...field, minHeight: 40 }} value={q.answerKey} onChange={e => patchQuestion(qi, { answerKey: e.target.value })} placeholder="Öğretmen cevap anahtarı (öğrenciye gösterilmez)" />
          </div>
        )
      })}
      <div><button className="btn btn-ghost" onClick={() => setQuestions(list => [...list, emptyQuestion()])}>+ Soru ekle</button></div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>{questions.length} soru · toplam {total} puan</span>
        <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy || !questions.length}>Taslak kaydet</button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={busy || !questions.length}>Kaydet ve yayınla</button>
        <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Vazgeç</button>
      </div>
    </div>
  )
}
