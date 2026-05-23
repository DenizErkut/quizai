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
    if (cls?.length) { setSelectedClass(cls[0].id); loadStats(cls[0].id) }
    setLoading(false)
  }

  async function loadStats(classroomId: string) {
    setStatsLoading(true)
    const { data: students } = await supabase
      .from('classroom_students')
      .select('student_id, profiles(name, grade)')
      .eq('classroom_id', classroomId)

    if (!students?.length) { setStudentStats([]); setStatsLoading(false); return }

    const studentIds = students.map((s: any) => s.student_id)
    const { data: sessions } = await supabase
      .from('quiz_sessions')
      .select('user_id, score, pct, question_count, topic, created_at')
      .in('user_id', studentIds)
      .eq('completed', true)
      .order('created_at', { ascending: false })

    const statsMap = students.map((s: any) => {
      const userSessions = (sessions ?? []).filter((sess: any) => sess.user_id === s.student_id)
      const avgPct = userSessions.length
        ? Math.round(userSessions.reduce((acc: number, sess: any) => acc + sess.pct, 0) / userSessions.length)
        : null
      const lastSession = userSessions[0]
      return {
        student_id: s.student_id,
        name: s.profiles?.name || 'İsimsiz',
        grade: s.profiles?.grade,
        totalTests: userSessions.length,
        avgPct,
        lastTopic: lastSession?.topic,
        lastDate: lastSession?.created_at,
        sessions: userSessions.slice(0, 3),
      }
    })

    setStudentStats(statsMap.sort((a: any, b: any) => (b.avgPct ?? -1) - (a.avgPct ?? -1)))
    setStatsLoading(false)
  }

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text3)'
    if (pct >= 80) return 'var(--green)'
    if (pct >= 50) return '#d97706'
    return 'var(--red)'
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text3)', fontSize: '14px' }}>Yükleniyor...</div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: '13px', textDecoration: 'none' }}>← Panel</Link>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Öğrenci Performansı</h1>
        </div>

        {/* Sınıf seçici */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {classrooms.map(c => (
            <button key={c.id}
              onClick={() => { setSelectedClass(c.id); loadStats(c.id) }}
              style={{
                padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer',
                border: '1.5px solid', fontFamily: 'var(--font-sans)', fontWeight: 500,
                background: selectedClass === c.id ? 'rgba(30,207,184,0.1)' : 'var(--bg2)',
                borderColor: selectedClass === c.id ? 'rgba(30,207,184,0.4)' : 'var(--border)',
                color: selectedClass === c.id ? 'var(--accent)' : 'var(--text)',
              }}
            >{c.name}</button>
          ))}
        </div>

        {statsLoading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)', fontSize: '14px' }}>Yükleniyor...</div>
        ) : studentStats.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>Veri yok</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Sınıfa öğrenci eklendiğinde performans burada görünecek.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {/* Sınıf ortalaması */}
            {(() => {
              const withData = studentStats.filter(s => s.avgPct !== null)
              const classAvg = withData.length ? Math.round(withData.reduce((acc, s) => acc + s.avgPct, 0) / withData.length) : null
              return classAvg !== null && (
                <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Sınıf Ortalaması</div>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: pctColor(classAvg) }}>%{classAvg}</div>
                </div>
              )
            })()}

            {/* Öğrenci kartları */}
            {studentStats.map((s: any, i: number) => (
              <div key={s.student_id} className="card" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: s.sessions.length ? '10px' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(30,207,184,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
                    }}>
                      {i + 1}
                    </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {s.totalTests} test · {s.grade && `${s.grade}. Sınıf`}
                        {s.lastDate && ` · Son: ${new Date(s.lastDate).toLocaleDateString('tr-TR')}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: pctColor(s.avgPct) }}>
                      {s.avgPct !== null ? `%${s.avgPct}` : '—'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>ortalama</div>
                  </div>
                </div>

                {/* Son testler */}
                {s.sessions.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                    {s.sessions.map((sess: any, j: number) => (
                      <div key={j} style={{
                        fontSize: '11px', padding: '4px 10px', borderRadius: '7px',
                        background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)',
                      }}>
                        {sess.topic} · <span style={{ color: pctColor(sess.pct), fontWeight: 600 }}>%{sess.pct}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
