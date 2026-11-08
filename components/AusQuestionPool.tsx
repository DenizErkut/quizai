'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { svgDataUri, parseAnswerTable } from '@/lib/open-ended-scenarios'

type Item = { id: string; source: 'student_ai' | 'teacher_assignment'; grade: string | null; subject: string | null; topic: string | null; scenario: string; question: string; rubric: Array<{ criterion: string; maxPoints: number; description?: string }>; figure_svg: string | null; answer_table: string | null; status: 'pending' | 'approved' | 'rejected'; reviewed_by_role: string | null; reviewed_at: string | null; review_note: string | null; created_at: string }
type Status = 'pending' | 'approved' | 'rejected'

const field: React.CSSProperties = { padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }
const LABEL: Record<Status, string> = { pending: 'Bekleyen', approved: 'Onaylanan', rejected: 'Reddedilen' }

// Açık uçlu sorular havuzu: üretilen/kaydedilen sorular burada toplanır; yönetici ya da onaylı öğretmen onaylar veya reddeder.
export default function AusQuestionPool() {
  const [status, setStatus] = useState<Status>('pending')
  const [subject, setSubject] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 })
  const [subjects, setSubjects] = useState<string[]>([])
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')

  const headers = async () => {
    const { data: { session } } = await createClient().auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status, page: String(page) })
    if (subject) params.set('subject', subject)
    if (source) params.set('source', source)
    const res = await fetch(`/api/aus-pool?${params}`, { headers: await headers(), cache: 'no-store' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setMessage(json.error || 'Havuz alınamadı.'); return }
    setItems(json.items); setTotal(json.total); setCounts(json.counts); setSubjects(json.subjects || [])
  }, [status, subject, source, page])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function decide(item: Item, decision: Status) {
    let note = ''
    if (decision === 'rejected') { const reason = window.prompt('Red nedeni (isteğe bağlı):'); if (reason === null) return; note = reason }
    setBusy(item.id); setMessage('')
    const res = await fetch('/api/aus-pool', { method: 'POST', headers: await headers(), body: JSON.stringify({ id: item.id, decision, note }) })
    const json = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) { setMessage(json.error || 'Karar kaydedilemedi.'); return }
    setMessage(decision === 'approved' ? '✓ Onaylandı.' : decision === 'rejected' ? '✓ Reddedildi.' : '✓ Beklemeye alındı.')
    await load()
  }

  const pages = Math.max(1, Math.ceil(total / 20))
  return (
    <div className="card" style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(['pending', 'approved', 'rejected'] as Status[]).map(key => (
          <button key={key} className={`btn btn-sm ${status === key ? 'btn-primary' : ''}`} onClick={() => { setStatus(key); setPage(1) }}>{LABEL[key]} ({counts[key]})</button>
        ))}
        <select style={field} value={subject} onChange={e => { setSubject(e.target.value); setPage(1) }} aria-label="Ders"><option value="">Tüm dersler</option>{subjects.map(name => <option key={name} value={name}>{name}</option>)}</select>
        <select style={field} value={source} onChange={e => { setSource(e.target.value); setPage(1) }} aria-label="Kaynak"><option value="">Tüm kaynaklar</option><option value="student_ai">Öğrenci (AI üretimi)</option><option value="teacher_assignment">Öğretmen ödevi</option></select>
        <button className="btn btn-sm" onClick={() => void load()}>Yenile</button>
      </div>
      {message && <div role="status" style={{ fontSize: 13, color: 'var(--text2)' }}>{message}</div>}
      {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--text2)' }}>Bu durumda soru yok.</p>}
      {items.map(item => {
        const table = parseAnswerTable(item.answer_table)
        const expanded = !!open[item.id]
        return (
          <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px' }}>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', fontWeight: 700 }}>
              {[item.grade, item.subject, item.topic].filter(Boolean).join(' · ')} · {item.source === 'student_ai' ? 'Öğrenci (AI üretimi)' : 'Öğretmen ödevi'} · {new Date(item.created_at).toLocaleDateString('tr-TR')}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, margin: '6px 0', whiteSpace: 'pre-wrap' }}>{item.scenario}</div>
            {item.figure_svg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={svgDataUri(item.figure_svg)} alt="Şekil" style={{ maxWidth: 320, background: '#fff', border: '1px solid var(--border)', borderRadius: 4 }} />
            )}
            {table && (
              <div style={{ overflowX: 'auto', margin: '6px 0' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead><tr>{table.headers.map((h, i) => <th key={i} style={{ border: '1px solid var(--border)', padding: '4px 8px', background: 'var(--accent-bg)' }}>{h}</th>)}</tr></thead>
                  <tbody>{table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} style={{ border: '1px solid var(--border)', padding: '4px 8px', minWidth: 60, fontWeight: c === 0 ? 700 : 400 }}>{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
            )}
            <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.6 }}>{item.question}</div>
            <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setOpen(prev => ({ ...prev, [item.id]: !prev[item.id] }))}>{expanded ? '▲ Rubriği gizle' : `▼ Rubrik (${item.rubric.length} ölçüt · ${item.rubric.reduce((sum, r) => sum + (Number(r.maxPoints) || 0), 0)} puan)`}</button>
            {expanded && (
              <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                {item.rubric.map((r, i) => (
                  <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12.5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{r.criterion}</span><span>{r.maxPoints} puan</span></div>
                    {r.description && <div style={{ color: 'var(--text2)', marginTop: 2 }}>{r.description}</div>}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
              {item.status !== 'approved' && <button className="btn btn-primary btn-sm" disabled={busy === item.id} onClick={() => void decide(item, 'approved')}>✓ Onayla</button>}
              {item.status !== 'rejected' && <button className="btn btn-sm" disabled={busy === item.id} onClick={() => void decide(item, 'rejected')}>✕ Reddet</button>}
              {item.status !== 'pending' && <button className="btn btn-sm" disabled={busy === item.id} onClick={() => void decide(item, 'pending')}>↺ Beklemeye al</button>}
              {item.status !== 'pending' && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{item.reviewed_by_role === 'teacher' ? 'Öğretmen' : 'Yönetici'} kararı{item.reviewed_at ? ` · ${new Date(item.reviewed_at).toLocaleDateString('tr-TR')}` : ''}{item.review_note ? ` · ${item.review_note}` : ''}</span>}
            </div>
          </div>
        )
      })}
      {pages > 1 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Önceki</button>
          <span style={{ fontSize: 12.5 }}>{page} / {pages}</span>
          <button className="btn btn-sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Sonraki ›</button>
        </div>
      )}
    </div>
  )
}
