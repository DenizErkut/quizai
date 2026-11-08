'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { compressImage } from '@/lib/image-compress'
import { decodeQrFromFile } from '@/lib/qr-decode'
import { parseQuizQr, hasOptions } from '@/lib/quiz-print'

type QuizQuestion = { q?: string; opts?: string[]; ans?: number; type?: string }
type Assignment = { id: string; classroom_id: string; title: string; pool_questions?: QuizQuestion[] }
type Student = { id: string; schoolNo: string | null; fullName: string; classroomId?: string }
type Image = { mediaType: 'image/jpeg'; data: string }
type Entry = {
  key: string; studentId: string; images: Image[]
  answers: Array<{ choice: number; uncertain: boolean }> | null
  status: 'queued' | 'reading' | 'read' | 'saving' | 'saved' | 'error'; message: string; score?: string; conflict?: boolean
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const CONCURRENCY = 3

// Basılı optik cevap kâğıtlarını toplu yükle: her sayfa QR koduyla öğrenciye eşlenir, işaretli şıklar okunur, öğretmen kontrol edip puanlar.
export default function QuizPaperImport({ assignment, onClose }: { assignment: Assignment; onClose: () => void }) {
  const { t } = useT()
  const supabase = createClient()
  const questions = assignment.pool_questions || []
  const [students, setStudents] = useState<Student[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState('')

  const headers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }
  const patch = (key: string, change: Partial<Entry>) => setEntries(list => list.map(e => e.key === key ? { ...e, ...change } : e))
  const nameOf = (id: string) => { if (!id) return t('Öğrenci seçilmedi'); const s = students.find(x => x.id === id); return s ? `${s.schoolNo ? `${s.schoolNo} — ` : ''}${s.fullName}` : id.slice(0, 8) }

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/teacher/students-roster', { headers: await headers() })
      const data = await res.json().catch(() => null)
      setStudents((data?.students || []).filter((s: Student) => s.classroomId === assignment.classroom_id))
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function call(body: Record<string, unknown>) {
    const res = await fetch('/api/teacher/import-quiz-paper', { method: 'POST', headers: await headers(), body: JSON.stringify({ assignment_id: assignment.id, ...body }) })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
  }

  async function readEntry(entry: Entry) {
    patch(entry.key, { status: 'reading', message: t('Okunuyor…') })
    try {
      const { ok, data } = await call({ action: 'read', images: entry.images.slice(0, 3) })
      if (!ok) { patch(entry.key, { status: 'error', message: data?.error || t('Kâğıt okunamadı. Daha net ve düz bir fotoğrafla tekrar dene.') }); return }
      patch(entry.key, { status: 'read', message: '', answers: (data.answers as Array<{ choice: number; uncertain: boolean }>).map(a => ({ choice: a.choice, uncertain: a.uncertain })) })
    } catch { patch(entry.key, { status: 'error', message: t('Bağlantı hatası, tekrar dene.') }) }
  }

  async function readAll() {
    if (!files.length) return
    setBusy('read'); setEntries([]); setSkipped([]); setProgress(t('Sayfalar QR koduna göre eşleniyor…'))
    const byStudent = new Map<string, Entry>()
    const list: Entry[] = []
    const rosterIds = new Set(students.map(s => s.id))
    const unknown: string[] = []
    for (const [index, file] of files.entries()) {
      let qr = null as ReturnType<typeof parseQuizQr>
      try { qr = parseQuizQr(await decodeQrFromFile(file)) } catch { qr = null }
      const image = await compressImage(file)
      if (qr && qr.assignmentId !== assignment.id) { unknown.push(`${file.name}: ${t('QR bu ödeve ait değil')}`); continue }
      if (qr && !rosterIds.has(qr.studentId)) { unknown.push(`${file.name}: ${t('Öğrenci bu sınıfta değil')}`); continue }
      if (qr) {
        const entry = byStudent.get(qr.studentId) || { key: qr.studentId, studentId: qr.studentId, images: [], answers: null, status: 'queued' as const, message: '' }
        if (!byStudent.has(qr.studentId)) { byStudent.set(qr.studentId, entry); list.push(entry) }
        entry.images.push(image)
      } else {
        list.push({ key: `u${index}`, studentId: '', images: [image], answers: null, status: 'queued', message: t('QR okunamadı; öğrenciyi aşağıdan seç.') })
      }
    }
    setEntries(list); setSkipped(unknown)
    const readable = list.filter(e => e.studentId)
    let next = 0, done = 0
    const worker = async () => {
      while (next < readable.length) {
        await readEntry(readable[next++])
        done++; setProgress(t('{done}/{total} öğrenci okundu', { done, total: readable.length }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, readable.length) }, worker))
    setProgress(''); setBusy('')
  }

  async function assignStudent(entry: Entry, studentId: string) {
    if (!studentId) return
    patch(entry.key, { studentId, status: 'queued', message: '' })
    setBusy('read'); await readEntry({ ...entry, studentId }); setBusy('')
  }

  async function saveEntry(entry: Entry, replace = false) {
    if (!entry.answers) return
    patch(entry.key, { status: 'saving', message: t('Puanlanıyor…') })
    const { ok, status, data } = await call({ action: 'save', student_id: entry.studentId, replace, choices: entry.answers.map(a => a.choice) })
    if (status === 409 && !replace) { patch(entry.key, { status: 'read', conflict: true, message: data?.error || t('Bu öğrenci bu ödevi zaten tamamlamış.') }); return }
    if (!ok) { patch(entry.key, { status: 'error', message: data?.error || t('Kaydedilemedi.') }); return }
    patch(entry.key, { status: 'saved', conflict: false, message: '', score: `${data.score} / ${data.total} (%${data.pct})` })
  }

  async function saveAll() {
    setBusy('save')
    for (const entry of entries) if (entry.status === 'read' && !entry.conflict) await saveEntry(entry)
    setBusy('')
  }

  const readyCount = entries.filter(e => e.status === 'read' && !e.conflict).length
  return (
    <div className="card" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>{t('📥 Optik cevap kâğıtlarını aktar — QR ile')}</strong>
        <button className="btn btn-sm" onClick={onClose} disabled={!!busy}>{t('Kapat')}</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{t('Öğrencilerin doldurduğu optik cevap kâğıtlarının (1. sayfa) fotoğraf/taramalarını birlikte seçin; öğrenci seçmenize gerek yok. Her sayfa QR koduyla öğrenciye otomatik eşlenir. Fotoğraflar yalnızca okunmak için işlenir, saklanmaz.')}</div>
      <input type="file" accept="image/*" multiple disabled={!!busy} onChange={e => { setFiles(Array.from(e.target.files || [])); setEntries([]) }} aria-label={t('Cevap kâğıdı fotoğrafları')} />
      <button className="btn btn-primary" disabled={!!busy || !files.length || !students.length} onClick={() => void readAll()}>{busy === 'read' ? t('⏳ Okunuyor…') : t('Sayfaları oku')}</button>
      {progress && <div role="status" style={{ fontSize: 12, color: 'var(--text2)' }}>{progress}</div>}
      {skipped.length > 0 && <div role="alert" style={{ fontSize: 11.5, color: 'var(--amber, #b45309)' }}>⚠️ {t('Eşlenemeyen sayfalar:')} {skipped.join(' · ')}</div>}

      {entries.map(entry => (
        <details key={entry.key} open={!entry.studentId || entry.status === 'read'} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
            {nameOf(entry.studentId)}
            {entry.status === 'saved' && <span style={{ color: 'var(--green)' }}> · ✓ {entry.score}</span>}
            {entry.status === 'read' && <span style={{ color: 'var(--text3)' }}> · {t('kontrol bekliyor')}</span>}
            {entry.status === 'error' && <span style={{ color: 'var(--red)' }}> · ⚠️</span>}
            {(entry.status === 'reading' || entry.status === 'saving' || entry.status === 'queued') && <span style={{ color: 'var(--text3)' }}> · ⏳</span>}
          </summary>
          {!entry.studentId && (
            <select value="" onChange={e => void assignStudent(entry, e.target.value)} disabled={!!busy} aria-label={t('Öğrenci seç')} style={{ marginTop: 6, width: '100%' }}>
              <option value="">{t('Öğrenci seç…')}</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.schoolNo ? `${s.schoolNo} — ` : ''}{s.fullName}</option>)}
            </select>
          )}
          {entry.answers && entry.status !== 'saved' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginTop: 6 }}>
              {entry.answers.map((a, i) => !hasOptions(questions[i] || {}) ? null : (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: a.uncertain ? 'var(--amber, #b45309)' : 'inherit' }}>
                  <b>{i + 1}.</b>
                  <select value={a.choice} aria-label={t('Soru {n} cevabı', { n: i + 1 })}
                    onChange={e => setEntries(list => list.map(x => x.key === entry.key && x.answers ? { ...x, answers: x.answers.map((y, j) => j === i ? { choice: Number(e.target.value), uncertain: false } : y) } : x))}>
                    <option value={-1}>{t('Boş')}</option>
                    {(questions[i]?.opts || []).slice(0, LETTERS.length).map((_, k) => <option key={k} value={k}>{LETTERS[k]}</option>)}
                  </select>
                  {a.uncertain && '⚠️'}
                </label>
              ))}
            </div>
          )}
          {entry.message && <div style={{ fontSize: 12, color: entry.status === 'error' ? 'var(--red)' : 'var(--text2)', marginTop: 6 }}>{entry.message}</div>}
          {entry.conflict && <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={!!busy} onClick={() => void saveEntry(entry, true)}>{t('Üzerine yaz ve puanla')}</button>}
          {entry.status === 'error' && <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={!!busy} onClick={() => void readEntry(entry)}>{t('Yeniden dene')}</button>}
        </details>
      ))}
      {readyCount > 0 && <button className="btn btn-primary" disabled={!!busy} onClick={() => void saveAll()}>{busy === 'save' ? t('⏳ Puanlanıyor…') : t('Okunanları kontrol ettim, hepsini puanla ({n})', { n: readyCount })}</button>}
    </div>
  )
}
