'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function TeacherPerformancePage() {
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [studentStats, setStudentStats] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)
  const [studentDetail, setStudentDetail] = useState<any>(null)
  const [view, setView] = useState<'overview' | 'assignments' | 'student'>('overview')
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: t } = await supabase.from('teachers').select('*').eq('user_id', user.id).single()
    if (!t?.approved) { router.push('/teacher'); return }
    setTeacher(t)
    const { data: cls } = await supabase.from('classrooms').select('*').eq('teacher_id', t.id).order('created_at', { ascending: false })
    setClassrooms(cls ?? [])
    if (cls?.length) { setSelectedClass(cls[0].id); await loadData(t.id, cls[0].id) }
    setLoading(false)
  }

  async function loadData(teacherId: string, classroomId: string) {
    setStatsLoading(true)

    // Students
    const { data: students } = await supabase
      .from('classroom_students')
      .select('student_id, joined_at')
      .eq('classroom_id', classroomId)

    if (!students?.length) { setStudentStats([]); setAssignments([]); setStatsLoading(false); return }

    const studentIds = students.map((s: any) => s.student_id)

    // Fetch profiles individually to bypass RLS edge cases
    const profileMap: Record<string, any> = {}
    await Promise.all(
      studentIds.map(async (id: string) => {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, name, grade, monthly_test_count')
          .eq('id', id)
          .maybeSingle()
        if (p) profileMap[id] = p
      })
    )

    // Quiz sessions
    const { data: sessions } = await supabase
      .from('quiz_sessions')
      .select('user_id, score, pct, question_count, topic, created_at')
      .in('user_id', studentIds)
      .eq('completed', true)
      .order('created_at', { ascending: false })

    // Assignments for this classroom
    const { data: asgns } = await supabase
      .from('assignments')
      .select('id, title, topic, question_count, difficulty, due_date, created_at')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })

    // Assignment completions for these students
    const asgIds = (asgns || []).map((a: any) => a.id)
    const { data: completions } = asgIds.length
      ? await supabase.from('assignment_completions').select('*').in('assignment_id', asgIds)
      : { data: [] }

    // Build stats per student
    const statsMap = students.map((s: any) => {
      const profile = profileMap[s.student_id] || {}
      const userSessions = (sessions ?? []).filter((sess: any) => sess.user_id === s.student_id)
      const userCompletions = (completions ?? []).filter((c: any) => c.student_id === s.student_id)
      const avgPct = userSessions.length
        ? Math.round(userSessions.reduce((acc: number, sess: any) => acc + sess.pct, 0) / userSessions.length) : null
      const assignmentAvg = userCompletions.length
        ? Math.round(userCompletions.reduce((acc: number, c: any) => acc + c.pct, 0) / userCompletions.length) : null
      return {
        student_id: s.student_id,
        name: profile.name || 'İsimsiz',
        grade: profile.grade,
        totalTests: userSessions.length,
        avgPct,
        assignmentsDone: userCompletions.length,
        assignmentAvg,
        lastTopic: userSessions[0]?.topic,
        lastActive: userSessions[0]?.created_at,
        sessions: userSessions,
        completions: userCompletions,
      }
    })

    // Build assignment summary
    const asgSummary = (asgns || []).map((a: any) => {
      const asgComps = (completions ?? []).filter((c: any) => c.assignment_id === a.id)
      const avgScore = asgComps.length
        ? Math.round(asgComps.reduce((acc: number, c: any) => acc + c.pct, 0) / asgComps.length) : null
      const studentResults = asgComps.map((c: any) => ({
        ...c,
        name: profileMap[c.student_id]?.name || 'İsimsiz',
      }))
      return { ...a, completedCount: asgComps.length, totalStudents: students.length, avgScore, studentResults }
    })

    setStudentStats(statsMap)
    setAssignments(asgSummary)
    setStatsLoading(false)
  }

  async function selectClass(cls: any) {
    setSelectedClass(cls.id)
    setView('overview')
    setSelectedStudent(null)
    await loadData(teacher.id, cls.id)
  }

  function openStudent(stat: any) {
    setSelectedStudent(stat.student_id)
    setStudentDetail(stat)
    setView('student')
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: '13px', textDecoration: 'none' }}>← Panel</Link>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>📊 Performans</h1>
        </div>

        {/* Class tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {classrooms.map(c => (
            <button key={c.id} onClick={() => selectClass(c)}
              style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', fontWeight: 500,
                background: selectedClass === c.id ? 'rgba(8,36,101,0.08)' : 'var(--bg2)',
                borderColor: selectedClass === c.id ? 'rgba(8,36,101,0.3)' : 'var(--border)',
                color: selectedClass === c.id ? 'var(--primary)' : 'var(--text)',
              }}>
              {c.name}
            </button>
          ))}
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
          {[
            { key: 'overview', label: '👥 Öğrenci Genel Bakış' },
            { key: 'assignments', label: `📝 Ödev Sonuçları (${assignments.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => { setView(t.key as any); setSelectedStudent(null) }}
              style={{ padding: '8px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                background: view === t.key ? '#082465' : 'var(--bg2)',
                borderColor: view === t.key ? '#082465' : 'var(--border)',
                color: view === t.key ? '#fff' : 'var(--text3)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {statsLoading && <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div>}

        {/* OVERVIEW: Student list */}
        {!statsLoading && view === 'overview' && (
          studentStats.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
              <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Bu sınıfta henüz öğrenci yok.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {studentStats.map((s: any) => (
                <div key={s.student_id} className="card" style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                  onClick={() => openStudent(s)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(8,36,101,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = '' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                        {(s.name || 'İ').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{s.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                          {s.grade && `${s.grade} · `}{s.totalTests} test · {s.lastTopic && `Son: ${s.lastTopic}`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      {s.avgPct !== null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '20px', color: s.avgPct >= 70 ? 'var(--green)' : s.avgPct >= 50 ? 'var(--amber)' : 'var(--red)' }}>%{s.avgPct}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Genel ort.</div>
                        </div>
                      )}
                      {s.assignmentsDone > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '20px', color: s.assignmentAvg >= 70 ? 'var(--green)' : 'var(--amber)' }}>%{s.assignmentAvg}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{s.assignmentsDone} ödev</div>
                        </div>
                      )}
                      {s.assignmentsDone === 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--text4)', background: 'var(--bg2)', padding: '4px 10px', borderRadius: '8px' }}>Ödev yok</div>
                      )}
                      <span style={{ color: 'var(--text4)', fontSize: '18px' }}>→</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ASSIGNMENTS: Per-assignment results */}
        {!statsLoading && view === 'assignments' && (
          assignments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📝</div>
              <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Bu sınıfa henüz ödev atanmadı.</div>
              <Link href="/teacher/assign" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '1rem', display: 'inline-flex' }}>Ödev Ata →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {assignments.map((a: any) => (
                <div key={a.id} className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{a.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                        📚 {a.topic} · ❓ {a.question_count} soru · ⚡ {a.difficulty}
                        {a.due_date && ` · 🕐 ${new Date(a.due_date).toLocaleDateString('tr-TR')}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--primary)' }}>{a.completedCount}/{a.totalStudents}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Tamamladı</div>
                      </div>
                      {a.avgScore !== null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '18px', color: a.avgScore >= 70 ? 'var(--green)' : 'var(--amber)' }}>%{a.avgScore}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Sınıf ort.</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Student results for this assignment */}
                  {a.studentResults.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Öğrenci Sonuçları
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {a.studentResults.sort((x: any, y: any) => y.pct - x.pct).map((r: any) => (
                          <div key={r.student_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                                {(r.name || 'İ').slice(0, 2).toUpperCase()}
                              </div>
                              <div style={{ fontSize: '13px', fontWeight: 500 }}>{r.name}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                                {r.score}/{r.score !== undefined ? Math.round(r.score / (r.pct / 100) || 0) : '?'} doğru
                              </div>
                              <div style={{ fontWeight: 800, fontSize: '16px', color: r.pct >= 70 ? 'var(--green)' : r.pct >= 50 ? 'var(--amber)' : 'var(--red)', minWidth: '42px', textAlign: 'right' }}>
                                %{r.pct}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Students who haven't completed */}
                      {(() => {
                        const doneIds = new Set(a.studentResults.map((r: any) => r.student_id))
                        const notDone = studentStats.filter(s => !doneIds.has(s.student_id))
                        if (!notDone.length) return null
                        return (
                          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text4)' }}>
                            ⏳ Tamamlamadı: {notDone.map((s: any) => s.name).join(', ')}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {a.completedCount === 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', fontSize: '13px', color: 'var(--text4)' }}>
                      ⏳ Henüz kimse tamamlamadı.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* STUDENT DETAIL */}
        {view === 'student' && studentDetail && (
          <div>
            <button onClick={() => setView('overview')} className="btn" style={{ marginBottom: '1rem', fontSize: '13px' }}>
              ← Listeye dön
            </button>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1rem' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '18px' }}>
                  {(studentDetail.name || 'İ').slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '18px' }}>{studentDetail.name}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>{studentDetail.grade}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {[
                  { label: 'Toplam Test', value: studentDetail.totalTests },
                  { label: 'Genel Ort.', value: studentDetail.avgPct !== null ? `%${studentDetail.avgPct}` : '—' },
                  { label: 'Tamamlanan Ödev', value: studentDetail.assignmentsDone },
                ].map((stat, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '12px', background: 'var(--bg2)', borderRadius: '10px' }}>
                    <div style={{ fontWeight: 800, fontSize: '22px', color: 'var(--primary)' }}>{stat.value}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Assignment completions */}
            {studentDetail.completions.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📝 Ödev Sonuçları
                </div>
                {studentDetail.completions.map((c: any) => {
                  const asgn = assignments.find((a: any) => a.id === c.assignment_id)
                  return (
                    <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{asgn?.title || 'Ödev'}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{asgn?.topic} · {new Date(c.completed_at).toLocaleDateString('tr-TR')}</div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '18px', color: c.pct >= 70 ? 'var(--green)' : c.pct >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                        %{c.pct}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Recent quiz sessions */}
            {studentDetail.sessions.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Son Testler
                </div>
                {studentDetail.sessions.slice(0, 10).map((s: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 9 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.topic}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{new Date(s.created_at).toLocaleDateString('tr-TR')}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: s.pct >= 70 ? 'var(--green)' : s.pct >= 50 ? 'var(--amber)' : 'var(--red)' }}>
                      %{s.pct}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
