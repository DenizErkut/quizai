'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import MathText from '@/components/MathText'
import AnswerSections from '@/components/AnswerSections'

type Assignment = { id: string; question: string; rubric: Array<{ criterion: string; maxPoints: number; description?: string }> }
type Session = { id: string; user_id: string; assignment_id: string; total_earned: number | null; total_possible: number | null; student_answer: string | null; criteria_results: Array<{ criterion: string; maxPoints: number; earnedPoints: number; feedback: string }> | null; overall_feedback: string | null; source: string }
type Student = { id: string; schoolNo: string | null; fullName: string; classroomId?: string }

const pct = (earned: number, total: number) => total > 0 ? Math.round((earned / total) * 1000) / 10 : 0

// Sınıf sonuçları: öğrenci × soru puan tablosu, öğrenci ve soru ortalamaları, hücreye tıklayınca yanıt ve en olası yanıtlar.
export default function OpenEndedResults({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { t } = useT()
  const supabase = createClient()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<{ student: Student; index: number } | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { Authorization: `Bearer ${session?.access_token}` }
      const res = await fetch(`/api/teacher/open-ended-results?id=${groupId}`, { headers, cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || t('Sonuçlar alınamadı.')); setLoading(false); return }
      setAssignments(json.assignments || []); setSessions(json.sessions || [])
      const rosterRes = await fetch('/api/teacher/students-roster', { headers })
      const roster = await rosterRes.json().catch(() => null)
      setStudents((roster?.students || []).filter((s: Student) => s.classroomId === json.classroomId))
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  // Öğrenci + soru başına en son puanlanan deneme (liste en yeniden eskiye).
  const cell = (studentId: string, assignmentId: string) => sessions.find(s => s.user_id === studentId && s.assignment_id === assignmentId)
  const rows = students.map(student => {
    const scored = assignments.map(a => cell(student.id, a.id))
    const done = scored.filter((s): s is Session => !!s)
    const earned = done.reduce((sum, s) => sum + (Number(s.total_earned) || 0), 0), total = done.reduce((sum, s) => sum + (Number(s.total_possible) || 0), 0)
    return { student, scored, done: done.length, avg: done.length ? pct(earned, total) : null }
  })
  const columnAvg = assignments.map((a, i) => {
    const list = rows.map(r => r.scored[i]).filter((s): s is Session => !!s)
    return list.length ? pct(list.reduce((s, x) => s + (Number(x.total_earned) || 0), 0), list.reduce((s, x) => s + (Number(x.total_possible) || 0), 0)) : null
  })
  const classAvgList = rows.filter(r => r.avg !== null)
  const classAvg = classAvgList.length ? Math.round(classAvgList.reduce((s, r) => s + (r.avg as number), 0) / classAvgList.length * 10) / 10 : null
  const th: React.CSSProperties = { border: '1px solid var(--border)', padding: '6px 8px', background: 'var(--accent-bg)', fontSize: 12, textAlign: 'center', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { border: '1px solid var(--border)', padding: '5px 8px', fontSize: 12.5, textAlign: 'center' }

  const dSession = detail ? cell(detail.student.id, assignments[detail.index].id) : undefined
  const dAssignment = detail ? assignments[detail.index] : undefined

  return (
    <div className="card" style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>{t('📊 Sınıf sonuçları')}</strong>
        <button className="btn btn-sm" onClick={onClose}>{t('Kapat')}</button>
      </div>
      {loading && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Yükleniyor...')}</div>}
      {error && <div role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
      {!loading && !error && (students.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Bu sınıfta öğrenci yok.')}</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead><tr>
              <th style={{ ...th, textAlign: 'left' }}>{t('Öğrenci')}</th>
              {assignments.map((_, i) => <th key={i} style={th}>{t('Soru {n}', { n: i + 1 })}</th>)}
              <th style={th}>{t('Ortalama not')}</th>
            </tr></thead>
            <tbody>
              {rows.map(({ student, scored, avg }) => (
                <tr key={student.id}>
                  <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{student.schoolNo ? `${student.schoolNo} — ` : ''}{student.fullName}</td>
                  {scored.map((s, i) => (
                    <td key={i} style={td}>
                      {s ? <button type="button" onClick={() => { setDetail({ student, index: i }) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, color: '#0a9e90', textDecoration: 'underline' }}>{s.total_earned ?? 0}/{s.total_possible ?? 100}</button> : <span style={{ color: 'var(--text3)' }}>–</span>}
                    </td>
                  ))}
                  <td style={{ ...td, fontWeight: 800 }}>{avg === null ? '–' : avg}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800, background: 'var(--bg2)' }}>{t('Sınıf ortalaması')}</td>
                {columnAvg.map((v, i) => <td key={i} style={{ ...td, fontWeight: 700, background: 'var(--bg2)' }}>{v === null ? '–' : v}</td>)}
                <td style={{ ...td, fontWeight: 800, background: 'var(--bg2)' }}>{classAvg === null ? '–' : classAvg}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {detail && dAssignment && (
        <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(10,20,16,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setDetail(null)}>
          <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: '1.25rem', borderRadius: 6 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 700 }}>{detail.student.fullName} · {t('Soru {n}', { n: detail.index + 1 })}</div>
            <p style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.6, margin: '6px 0 12px' }}><MathText text={dAssignment.question} /></p>
            <AnswerSections sections={[
              { key: 'mine', label: t('Öğrencinin verdiği yanıt'), content: (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0a9e90', marginBottom: 8 }}>{dSession?.total_earned ?? 0} / {dSession?.total_possible ?? 100}{dSession?.source === 'paper' ? ` · ${t('kâğıttan aktarıldı')}` : ''}</div>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.7, background: 'var(--bg2, var(--bg))', border: '1px solid var(--border)', borderRadius: 4, padding: '10px 12px' }}>{dSession?.student_answer?.trim() || t('Cevap bulunamadı')}</div>
                  {dSession?.overall_feedback && <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginTop: 10 }}>{dSession.overall_feedback}</p>}
                  {(dSession?.criteria_results || []).map((c, i) => (
                    <div key={i} style={{ borderTop: '1px solid var(--border)', padding: '8px 0', fontSize: 12.5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{c.criterion}</span><span style={{ color: '#0a9e90' }}>{c.earnedPoints}/{c.maxPoints}</span></div>
                      {c.feedback && <div style={{ color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>{c.feedback}</div>}
                    </div>
                  ))}
                </div>
              ) },
              { key: 'expected', label: t('Verilmesi gereken en olası yanıt'), content: (
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 8px' }}>{t('Tam puan için beklenen yanıt unsurları:')}</p>
                  {dAssignment.rubric.map((c, i) => (
                    <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px', marginBottom: 8, fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>{c.criterion}</span><span style={{ color: 'var(--accent)' }}>{c.maxPoints} {t('puan')}</span></div>
                      {c.description && <div style={{ color: 'var(--text2)', marginTop: 3, lineHeight: 1.6 }}><MathText text={c.description} /></div>}
                    </div>
                  ))}
                </div>
              ) },
            ]} />
            <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => setDetail(null)}>{t('Kapat')}</button>
          </div>
        </div>
      )}
    </div>
  )
}
