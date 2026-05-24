'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function StudentAssignmentsPage() {
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active')
  const [assignments, setAssignments] = useState<any[]>([])
  const [completions, setCompletions] = useState<any[]>([])
  const [myClasses, setMyClasses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // My classrooms
    const { data: memberships } = await supabase
      .from('classroom_students')
      .select('classroom_id, classrooms(id, name, teacher_id)')
      .eq('student_id', user.id)

    const classroomIds = (memberships || []).map((m: any) => m.classroom_id)
    setMyClasses((memberships || []).map((m: any) => m.classrooms))

    if (classroomIds.length === 0) { setLoading(false); return }

    // Assignments for my classrooms
    const { data: asgn } = await supabase
      .from('assignments')
      .select('*, classrooms(name)')
      .in('classroom_id', classroomIds)
      .order('created_at', { ascending: false })

    // My completions
    const { data: comp } = await supabase
      .from('assignment_completions')
      .select('*, assignments(title, topic)')
      .eq('student_id', user.id)

    const completedIds = new Set((comp || []).map((c: any) => c.assignment_id))
    const active = (asgn || []).filter((a: any) => !completedIds.has(a.id))
    const completed = (comp || [])

    setAssignments(active)
    setCompletions(completed)
    setLoading(false)
  }

  function isOverdue(due_date: string) {
    return due_date && new Date(due_date) < new Date()
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>

        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>📝 Ödevlerim</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
            {myClasses.length > 0 ? myClasses.map((c: any) => c?.name).filter(Boolean).join(', ') : 'Henüz bir sınıfa katılmadın'}
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
          {[
            { key: 'active', label: `📋 Aktif Ödevler (${assignments.length})` },
            { key: 'completed', label: `✅ Tamamlananlar (${completions.length})` },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: '8px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                background: activeTab === t.key ? 'rgba(8,36,101,0.08)' : 'var(--bg2)',
                borderColor: activeTab === t.key ? 'rgba(8,36,101,0.3)' : 'var(--border)',
                color: activeTab === t.key ? 'var(--primary)' : 'var(--text3)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Active assignments */}
        {activeTab === 'active' && (
          assignments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎉</div>
              <div style={{ fontWeight: 600, marginBottom: '6px', color: 'var(--primary)' }}>Aktif ödevin yok!</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
                {myClasses.length === 0 ? 'Önce bir sınıfa katıl.' : 'Öğretmenin yeni ödev eklediğinde burada görünecek.'}
              </div>
              {myClasses.length === 0 && (
                <Link href="/join" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '1rem', display: 'inline-flex' }}>
                  Sınıfa Katıl →
                </Link>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {assignments.map((a: any) => (
                <div key={a.id} className="card" style={{ borderLeft: `4px solid ${isOverdue(a.due_date) ? 'var(--red)' : 'var(--accent)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>{a.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span>📚 {a.topic}</span>
                        <span>🏫 {a.classrooms?.name}</span>
                        <span>❓ {a.question_count} soru</span>
                        <span>⚡ {a.difficulty}</span>
                        {a.question_type && a.question_type !== 'multiple_choice' && (
                          <span>🔤 {{'fill_blank':'Boşluk Doldurma','true_false':'D/Y','matching':'Eşleştirme','ordering':'Sıralama','short_answer':'Kısa Cevap','mixed':'Karma'}[a.question_type] || a.question_type}</span>
                        )}
                        {a.due_date && (
                          <span style={{ color: isOverdue(a.due_date) ? 'var(--red)' : 'var(--text3)', fontWeight: isOverdue(a.due_date) ? 700 : 400 }}>
                            🕐 {new Date(a.due_date).toLocaleDateString('tr-TR')}{isOverdue(a.due_date) ? ' ⚠️ Süresi doldu' : '\'e kadar'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/quiz?assignment=${a.id}&topic=${encodeURIComponent(a.topic)}&count=${a.question_count}&difficulty=${a.difficulty}&type=${a.question_type || 'multiple_choice'}`}
                    className="btn btn-primary"
                    style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>
                    ⚡ Ödevi Çöz
                  </Link>
                </div>
              ))}
            </div>
          )
        )}

        {/* Completed assignments */}
        {activeTab === 'completed' && (
          completions.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
              <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Henüz tamamlanan ödevin yok.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {completions.map((c: any) => (
                <div key={c.id} className="card" style={{ borderLeft: '4px solid var(--green)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)' }}>{c.assignments?.title || 'Ödev'}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '3px' }}>
                      {c.assignments?.topic} · {new Date(c.completed_at).toLocaleDateString('tr-TR')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                    <div style={{ fontWeight: 800, fontSize: '20px', color: c.pct >= 70 ? 'var(--green)' : 'var(--red)' }}>%{c.pct}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{c.score} doğru</div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </main>
  )
}
