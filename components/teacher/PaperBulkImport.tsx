'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { compressImage } from '@/lib/image-compress'
import { decodeQrFromFile } from '@/lib/qr-decode'
import { parseTeacherQr } from '@/lib/open-ended-print'

type Assignment = { id: string; classroom_id: string; title: string; question: string }
type Student = { id: string; schoolNo: string | null; fullName: string; classroomId?: string }
type Image = { mediaType: 'image/jpeg'; data: string }
type Entry = {
  studentId: string; pages: Array<{ order: number; image: Image }>
  answers: Array<{ assignmentId: string; text: string; legible: boolean; note: string }> | null
  status: 'queued' | 'reading' | 'read' | 'saving' | 'saved' | 'error'; message: string; score?: string; conflict?: boolean
}

const CHUNK = 5        // tek okuma çağrısında en çok sayfa (API sınırı 6)
const CONCURRENCY = 3  // aynı anda okunan öğrenci sayısı

// Sınıfın tüm öğrenci kâğıtlarını tek seferde yükle: her sayfa üzerindeki QR (öğrenci + soru) ile öğrenci ve soruya eşlenir.
export default function PaperBulkImport({ group, onClose }: { group: Assignment[]; onClose: () => void }) {
  const { t } = useT()
  const supabase = createClient()
  const [students, setStudents] = useState<Student[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState('')
  const ids = group.map(a => a.id)

  const headers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }
  const patch = (studentId: string, change: Partial<Entry>) => setEntries(list => list.map(e => e.studentId === studentId ? { ...e, ...change } : e))
  const nameOf = (id: string) => { const s = students.find(x => x.id === id); return s ? `${s.schoolNo ? `${s.schoolNo} — ` : ''}${s.fullName}` : id.slice(0, 8) }

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/teacher/students-roster', { headers: await headers() })
      const data = await res.json().catch(() => null)
      setStudents((data?.students || []).filter((s: Student) => s.classroomId === group[0].classroom_id))
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function call(body: Record<string, unknown>) {
    const res = await fetch('/api/teacher/import-paper-answers', { method: 'POST', headers: await headers(), body: JSON.stringify({ assignment_ids: ids, ...body }) })
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) }
  }

  async function transcribeEntry(entry: Entry) {
    patch(entry.studentId, { status: 'reading', message: t('Okunuyor…') })
    const pages = [...entry.pages].sort((a, b) => a.order - b.order)
    const merged = new Map<string, { text: string; legible: boolean; note: string }>()
    try {
      for (let start = 0; start < pages.length; start += CHUNK) {
        const { ok, data } = await call({ action: 'transcribe', student_id: entry.studentId, images: pages.slice(start, start + CHUNK).map(p => p.image) })
        if (!ok) { patch(entry.studentId, { status: 'error', message: data?.error || t('Kâğıt okunamadı. Daha net ve düz bir fotoğrafla tekrar dene.') }); return }
        for (const a of data.answers as Array<{ assignmentId: string; text: string; legible: boolean; note: string }>) {
          const old = merged.get(a.assignmentId)
          if (!old || (!old.text.trim() && a.text.trim())) merged.set(a.assignmentId, { text: a.text, legible: a.legible, note: a.note })
          else if (a.text.trim() && a.note) old.note = `${old.note} ${a.note}`.trim()
        }
      }
      patch(entry.studentId, { status: 'read', message: '', answers: group.map(a => ({ assignmentId: a.id, text: merged.get(a.id)?.text || '', legible: merged.get(a.id)?.legible !== false, note: merged.get(a.id)?.note || '' })) })
    } catch { patch(entry.studentId, { status: 'error', message: t('Bağlantı hatası, tekrar dene.') }) }
  }

  async function readAll() {
    if (!files.length) return
    setBusy('read'); setEntries([]); setSkipped([]); setProgress(t('Sayfalar QR koduna göre eşleniyor…'))
    const byStudent = new Map<string, Entry>()
    const rosterIds = new Set(students.map(s => s.id))
    const unknown: string[] = []
    let lastStudent: string | null = null
    for (const [index, file] of files.entries()) {
      let qr = null as ReturnType<typeof parseTeacherQr>
      try { qr = parseTeacherQr(await decodeQrFromFile(file)) } catch { qr = null }
      const image = await compressImage(file)
      let studentId = qr?.studentId ?? null
      if (qr && !ids.includes(qr.assignmentId)) { unknown.push(`${file.name}: ${t('QR bu ödeve ait değil')}`); continue }
      if (qr && !rosterIds.has(qr.studentId)) { unknown.push(`${file.name}: ${t('Öğrenci bu sınıfta değil')}`); continue }
      if (!studentId) {
        if (!lastStudent) { unknown.push(`${file.name}: ${t('QR okunamadı')}`); continue }
        studentId = lastStudent   // QR'sız sayfa (cevabın devamı) önceki sayfanın öğrencisine eklenir
      }
      lastStudent = studentId
      const order = qr ? Math.max(0, ids.indexOf(qr.assignmentId)) : 1000 + index
      const entry = byStudent.get(studentId) || { studentId, pages: [], answers: null, status: 'queued' as const, message: '' }
      entry.pages.push({ order, image }); byStudent.set(studentId, entry)
    }
    const list = [...byStudent.values()]
    setEntries(list); setSkipped(unknown)
    let next = 0, done = 0
    const worker = async () => {
      while (next < list.length) {
        const entry = list[next++]
        await transcribeEntry(entry)
        done++; setProgress(t('{done}/{total} öğrenci okundu', { done, total: list.length }))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker))
    setProgress(''); setBusy('')
  }

  async function saveEntry(entry: Entry, replace = false) {
    if (!entry.answers) return
    patch(entry.studentId, { status: 'saving', message: t('Puanlanıyor…') })
    const { ok, status, data } = await call({ action: 'save', student_id: entry.studentId, replace, answers: entry.answers.map(a => ({ assignmentId: a.assignmentId, text: a.text })) })
    if (status === 409 && !replace) { patch(entry.studentId, { status: 'read', conflict: true, message: data?.error || t('Bu öğrenci bu ödevi zaten tamamlamış.') }); return }
    if (!ok) { patch(entry.studentId, { status: 'error', message: data?.error || t('Kaydedilemedi.') }); return }
    const results = data.results as Array<{ totalEarned: number; totalPossible: number }>
    patch(entry.studentId, { status: 'saved', conflict: false, message: '', score: (() => { const e = results.reduce((s, r) => s + r.totalEarned, 0), p = results.reduce((s, r) => s + r.totalPossible, 0); return `${e} / ${p} (${t('ort.')} ${p > 0 ? Math.round((e / p) * 1000) / 10 : 0})` })() })
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
        <strong style={{ fontSize: 13 }}>{t('📷 Toplu tarama yükle — tüm sınıf')}</strong>
        <button className="btn btn-sm" onClick={onClose} disabled={!!busy}>{t('Kapat')}</button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{t('Sınıf dökümünün tüm sayfalarının fotoğraf/taramalarını birlikte seçin. Her sayfa QR koduyla öğrenciye ve soruya otomatik eşlenir. Fotoğraflar yalnızca okunmak için işlenir, saklanmaz.')}</div>
      <input type="file" accept="image/*" multiple disabled={!!busy} onChange={e => { setFiles(Array.from(e.target.files || [])); setEntries([]) }} aria-label={t('Cevap kâğıdı fotoğrafları')} />
      <button className="btn btn-primary" disabled={!!busy || !files.length || !students.length} onClick={() => void readAll()}>{busy === 'read' ? t('⏳ Okunuyor…') : t('Sayfaları oku')}</button>
      {progress && <div role="status" style={{ fontSize: 12, color: 'var(--text2)' }}>{progress}</div>}
      {skipped.length > 0 && <div role="alert" style={{ fontSize: 11.5, color: 'var(--amber, #b45309)' }}>⚠️ {t('Eşlenemeyen sayfalar:')} {skipped.join(' · ')}</div>}

      {entries.map(entry => (
        <details key={entry.studentId} style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
            {nameOf(entry.studentId)} · {t('{n} sayfa', { n: entry.pages.length })}
            {entry.status === 'saved' && <span style={{ color: 'var(--green)' }}> · ✓ {entry.score}</span>}
            {entry.status === 'read' && <span style={{ color: 'var(--text3)' }}> · {t('kontrol bekliyor')}</span>}
            {entry.status === 'error' && <span style={{ color: 'var(--red)' }}> · ⚠️</span>}
            {(entry.status === 'reading' || entry.status === 'saving' || entry.status === 'queued') && <span style={{ color: 'var(--text3)' }}> · ⏳</span>}
          </summary>
          {entry.answers && entry.status !== 'saved' && entry.answers.map((a, i) => (
            <div key={a.assignmentId} style={{ marginTop: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{t('Soru {n}', { n: i + 1 })}: {group[i]?.question.slice(0, 120)}</div>
              <textarea value={a.text} rows={3} style={{ width: '100%', borderRadius: 4 }} aria-label={t('Soru {n} cevabı', { n: i + 1 })}
                onChange={e => setEntries(list => list.map(x => x.studentId === entry.studentId && x.answers ? { ...x, answers: x.answers.map((y, j) => j === i ? { ...y, text: e.target.value } : y) } : x))} />
              {(!a.legible || a.note) && <div style={{ fontSize: 11, color: 'var(--amber, #b45309)' }}>⚠️ {a.note || t('Bazı kısımlar zor okundu; kontrol edin.')}</div>}
              {!a.text.trim() && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{t('Cevap bulunamadı — 0 puan verilir.')}</div>}
            </div>
          ))}
          {entry.message && <div style={{ fontSize: 12, color: entry.status === 'error' ? 'var(--red)' : 'var(--text2)', marginTop: 6 }}>{entry.message}</div>}
          {entry.conflict && <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={!!busy} onClick={() => void saveEntry(entry, true)}>{t('Üzerine yaz ve puanla')}</button>}
          {entry.status === 'error' && <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={!!busy} onClick={() => void transcribeEntry(entry)}>{t('Yeniden dene')}</button>}
        </details>
      ))}
      {readyCount > 0 && <button className="btn btn-primary" disabled={!!busy} onClick={() => void saveAll()}>{busy === 'save' ? t('⏳ Puanlanıyor…') : t('Okunanları kontrol ettim, hepsini puanla ({n})', { n: readyCount })}</button>}
    </div>
  )
}
