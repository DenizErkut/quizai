'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

function pctColor(p: number) { return p >= 80 ? 'var(--green)' : p >= 50 ? '#f59e0b' : 'var(--red)' }
function pctBg(p: number) { return p >= 80 ? 'var(--green-bg)' : p >= 50 ? 'rgba(245,158,11,0.1)' : 'var(--red-bg)' }

export default function TeacherReportPage() {
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [students, setStudents] = useState<any[]>([])
  const [selectedStudent, setSelectedStudent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [studentsLoading, setStudentsLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const res = await fetch('/api/report?type=teacher', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) {
        const d = await res.json()
        setClassrooms(d.classrooms || [])
        if (d.classrooms?.length) {
          setSelectedClass(d.classrooms[0].id)
          await loadStudents(d.classrooms[0].id, session.access_token)
        }
      }
      setLoading(false)
    }
    load()
  }, [])

  async function loadStudents(classId: string, token?: string) {
    setStudentsLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/report?type=teacher&classId=${classId}`, {
      headers: { Authorization: `Bearer ${token || session?.access_token}` }
    })
    if (res.ok) { const d = await res.json(); setStudents(d.students || []) }
    setStudentsLoading(false)
  }

  if (loading) return <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>

  const classAvg = students.length ? Math.round(students.reduce((a, s) => a + s.avgPct, 0) / students.length) : 0
  const perfectStudents = students.filter(s => s.perfect > 0).length
  const atRisk = students.filter(s => s.avgPct < 50 && s.totalTests > 0).length

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>

        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/teacher" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none' }}>← Öğretmen Paneli</Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginTop: '8px' }}>📊 Sınıf Raporu</h1>
        </div>

        {/* Sınıf seçici */}
        {classrooms.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {classrooms.map((c: any) => (
              <button key={c.id} onClick={() => { setSelectedClass(c.id); loadStudents(c.id) }}
                style={{ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${selectedClass === c.id ? 'var(--accent)' : 'var(--border)'}`, background: selectedClass === c.id ? 'var(--accent-bg)' : 'var(--bg)', color: selectedClass === c.id ? 'var(--accent)' : 'var(--text2)', fontSize: '13px', fontWeight: selectedClass === c.id ? 700 : 400, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {selectedStudent ? (
          /* Öğrenci detayı */
          <div>
            <button onClick={() => setSelectedStudent(null)} style={{ fontSize: '13px', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Sınıf listesine dön</button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>{selectedStudent.name}</h2>
                <div style={{ fontSize: '13px', color: 'var(--text3)' }}>{selectedStudent.grade} · 🔥 {selectedStudent.streak} gün seri</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '32px', fontWeight: 800, color: pctColor(selectedStudent.avgPct) }}>%{selectedStudent.avgPct}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>genel ortalama</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1rem' }}>
              {[
                { label: 'Toplam Test', value: selectedStudent.totalTests },
                { label: 'Toplam Soru', value: selectedStudent.totalQuestions },
                { label: 'Doğru', value: selectedStudent.totalCorrect, color: 'var(--green)' },
                { label: 'Mükemmel', value: selectedStudent.perfect, color: 'var(--green)' },
                { label: 'Zayıf Test', value: selectedStudent.failing, color: 'var(--red)' },
                { label: 'Bu Hafta', value: selectedStudent.weeklyTests, color: 'var(--accent)' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: s.color || 'var(--primary)' }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Trend */}
            {selectedStudent.trend?.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: '10px' }}>Test Trendi</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '60px' }}>
                  {selectedStudent.trend.map((t: any, i: number) => (
                    <div key={i} title={`${t.topic}: %${t.pct}`} style={{ flex: 1 }}>
                      <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${Math.max(t.pct * 0.6, 3)}px`, background: pctColor(t.pct) }} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Konular */}
            {selectedStudent.topTopics?.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', marginBottom: '10px' }}>Çalışılan Konular</div>
                {selectedStudent.topTopics.map((t: any, i: number) => (
                  <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                    <div style={{ flex: 1, fontSize: '13px' }}>{t.topic}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.count}x</div>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: pctColor(t.avgPct) }}>%{t.avgPct}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Sınıf özeti */
          <>
            {/* Sınıf istatistikleri */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.25rem' }}>
              {[
                { label: 'Öğrenci', value: students.length },
                { label: 'Sınıf Ort.', value: `%${classAvg}`, color: pctColor(classAvg) },
                { label: 'Mükemmel', value: perfectStudents, color: 'var(--green)' },
                { label: 'Risk Altında', value: atRisk, color: atRisk > 0 ? 'var(--red)' : 'var(--text3)' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '14px 8px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg)' }}>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: s.color || 'var(--primary)' }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Öğrenci listesi — sıralanmış */}
            {studentsLoading ? <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div> : (
              <div className="card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                  Öğrenciler (başarıya göre)
                </div>
                {students.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)', fontSize: '14px' }}>Bu sınıfta öğrenci yok</div>
                ) : students.map((s, i) => (
                  <div key={s.student_id} onClick={() => setSelectedStudent(s)}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined, cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: i === 0 ? '#fdd31d' : i === 1 ? '#e2e8f0' : i === 2 ? '#cd7f32' : 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: i < 3 ? '#082465' : 'var(--text3)', flexShrink: 0 }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{s.grade} · {s.totalTests} test · 🔥 {s.streak} gün</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text3)' }}>
                        <div>{s.totalCorrect}/{s.totalQuestions} doğru</div>
                        <div>Bu hafta: {s.weeklyTests}</div>
                      </div>
                      <div style={{ padding: '5px 10px', borderRadius: '8px', background: pctBg(s.avgPct), fontWeight: 800, fontSize: '14px', color: pctColor(s.avgPct), minWidth: '52px', textAlign: 'center' }}>
                        %{s.avgPct}
                      </div>
                    </div>
                    <span style={{ color: 'var(--text3)', fontSize: '12px' }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
