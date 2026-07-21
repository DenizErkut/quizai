'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { resolveIdentities, resolveName } from '@/lib/identity/resolve-client'

export default function TeacherDashboard() {
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'assign' | 'performance' | 'notify'>('dashboard')
  const [selectedClass, setSelectedClass] = useState<string>('all')
  const [notifyClass, setNotifyClass] = useState<string>('')
  const [notifyMsg, setNotifyMsg] = useState('')
  const [notifySending, setNotifySending] = useState(false)
  const [notifyResult, setNotifyResult] = useState('')
  const [notifyHistory, setNotifyHistory] = useState<any[]>([])
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login/teacher'); return }

    const { data: tRow } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle()
    if (!tRow) { router.push('/register/teacher'); return }
    // Öğretmenin adı artık TR-PG kimliğinde
    const teacherName = await resolveName(supabase, user.id)
    const t = { ...tRow, name: teacherName }
    if (!t.approved) { setTeacher(t); setLoading(false); return }

    setTeacher(t)

    const { data: cls } = await supabase
      .from('classrooms')
      .select('*, classroom_students(count)')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })

    const { data: asgn } = await supabase
      .from('assignments')
      .select('*, assignment_completions(count)')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })

    setClassrooms(cls ?? [])
    setAssignments(asgn ?? [])

    // Tüm öğrencilerin verilerini çek
    if (cls?.length) {
      const allStudentIds: string[] = []
      const classStudentMap: Record<string, string[]> = {}

      for (const c of cls) {
        const { data: cs } = await supabase
          .from('classroom_students')
          .select('student_id')
          .eq('classroom_id', c.id)
        const ids = (cs ?? []).map((x: any) => x.student_id)
        classStudentMap[c.id] = ids
        ids.forEach((id: string) => { if (!allStudentIds.includes(id)) allStudentIds.push(id) })
      }

      const studentIdentities = await resolveIdentities(supabase, allStudentIds)
      const studentData = await Promise.all(allStudentIds.map(async (sid: string) => {
        const [profileRes, streakRes, sessionsRes, completionsRes] = await Promise.all([
          supabase.from('profiles').select('grade, avatar_url').eq('id', sid).maybeSingle(),
          supabase.from('streaks').select('current_streak').eq('user_id', sid).maybeSingle(),
          supabase.from('quiz_sessions').select('pct, created_at, topic').eq('user_id', sid).eq('completed', true).order('created_at', { ascending: false }).limit(20),
          supabase.from('assignment_completions').select('id, score').eq('student_id', sid),
        ])
        const sessions = sessionsRes.data ?? []
        const completions = completionsRes.data ?? []
        const avgPct = sessions.length ? Math.round(sessions.reduce((a: number, s: any) => a + s.pct, 0) / sessions.length) : null
        const classroomIds = Object.entries(classStudentMap).filter(([, ids]) => ids.includes(sid)).map(([cid]) => cid)
        return {
          id: sid,
          name: studentIdentities[sid]?.full_name ?? 'İsimsiz',
          grade: profileRes.data?.grade ?? '',
          avatar_url: profileRes.data?.avatar_url ?? null,
          streak: streakRes.data?.current_streak ?? 0,
          totalTests: sessions.length,
          avgPct,
          assignmentsDone: completions.length,
          lastActive: sessions[0]?.created_at ?? null,
          lastTopic: sessions[0]?.topic ?? null,
          classroomIds,
        }
      }))
      setStudents(studentData)
    }
    // Bildirim geçmişi
    if (t?.id) {
      const { data: hist } = await supabase
        .from('teacher_notifications')
        .select('*, classrooms(name)')
        .eq('teacher_id', t.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setNotifyHistory(hist ?? [])
      if (cls?.length) setNotifyClass(cls[0]?.id || '')
    }

    setLoading(false)
  }

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct >= 70) return 'var(--green)'
    if (pct >= 50) return '#f59e0b'
    return 'var(--red)'
  }

  function timeAgo(iso: string | null) {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Bugün'
    if (days === 1) return 'Dün'
    return `${days} gün önce`
  }

  const filteredStudents = selectedClass === 'all'
    ? students
    : students.filter(s => s.classroomIds.includes(selectedClass))

  // Onay bekleme ekranı
  if (teacher && !teacher.approved) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: '1.5rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <div style={{ fontSize: '56px', marginBottom: '1rem' }}>⏳</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>Başvurunuz İnceleniyor</h1>
          <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
            Öğretmen başvurunuz admin onayı bekliyor. Onaylandığında e-posta ile bildirileceksiniz.
          </p>
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            className="btn" style={{ justifyContent: 'center' }}>Çıkış Yap</button>
        </div>
      </main>
    )
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  const totalStudents = students.length
  const activeStudents = students.filter(s => s.totalTests > 0).length
  const overallAvg = students.filter(s => s.avgPct !== null).length
    ? Math.round(students.filter(s => s.avgPct !== null).reduce((a, s) => a + (s.avgPct ?? 0), 0) / students.filter(s => s.avgPct !== null).length)
    : 0
  const pendingAssignments = assignments.filter((a: any) => !a.due_date || new Date(a.due_date) > new Date()).length

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Öğretmen Navbar */}
      <nav style={{ background: '#082465', padding: '0 1.5rem', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '32px', filter: 'brightness(0) invert(1)' }} />
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500 }}>
            🎓 {teacher?.name || 'Öğretmen'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {[
            { key: 'dashboard', label: '📊 Dashboard' },
            { key: 'students', label: '👥 Öğrenciler' },
            { key: 'assign', label: '📝 Ödev Ata' },
            { key: 'performance', label: '📈 Analiz' },
            { key: 'notify', label: '🔔 Bildirim' },
            { key: 'import', label: '📥 Not İçe Aktar', href: '/teacher/import-grades' },
            { key: 'live', label: '🎯 Canlı Test', href: '/teacher/live' },
          ].map(t => (
            (t as any).href ? (
              <Link key={t.key} href={(t as any).href}
                style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  background: 'rgba(255,255,255,0.1)', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.2)' }}>
                {t.label}
              </Link>
            ) : (
              <button key={t.key} onClick={() => setActiveTab(t.key as any)}
                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                  background: activeTab === t.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                  color: activeTab === t.key ? '#fff' : 'rgba(255,255,255,0.6)',
                }}>
                {t.label}
              </button>
            )
          ))}
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            Çıkış
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1.5rem', paddingBottom: '5rem' }}>

        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>
                Hoş geldin, {teacher?.name?.split(' ')[0]} 👋
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>{teacher?.school}</p>
            </div>

            {/* Özet kartlar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                { icon: '👥', label: 'Toplam Öğrenci', value: totalStudents, color: 'var(--primary)' },
                { icon: '⚡', label: 'Aktif Öğrenci', value: activeStudents, color: 'var(--accent)' },
                { icon: '🏫', label: 'Sınıf', value: classrooms.length, color: '#7c3aed' },
                { icon: '📝', label: 'Aktif Ödev', value: pendingAssignments, color: '#d97706' },
                { icon: '📊', label: 'Genel Ortalama', value: overallAvg ? `%${overallAvg}` : '—', color: pctColor(overallAvg || null) },
              ].map((s, i) => (
                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: '20px', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Sınıflar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>🏫 Sınıflarım</div>
                {classrooms.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Henüz sınıf yok.</div>
                ) : classrooms.map((c: any) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: 'var(--text3)' }}>{c.classroom_students?.[0]?.count ?? 0} öğrenci</span>
                  </div>
                ))}
                <button onClick={() => router.push('/teacher/students')}
                  style={{ marginTop: '10px', fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                  Sınıfları yönet →
                </button>
              </div>

              {/* Son ödevler */}
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>📝 Son Ödevler</div>
                {assignments.slice(0, 5).length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Henüz ödev yok.</div>
                ) : assignments.slice(0, 5).map((a: any) => (
                  <div key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                      {a.assignment_completions?.[0]?.count ?? 0} tamamladı
                      {a.due_date && ` · Son: ${new Date(a.due_date).toLocaleDateString('tr-TR')}`}
                    </div>
                  </div>
                ))}
                <button onClick={() => setActiveTab('assign')}
                  style={{ marginTop: '10px', fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                  Ödev ata →
                </button>
              </div>
            </div>

            {/* En zayıf öğrenciler */}
            {students.filter(s => s.avgPct !== null && s.avgPct < 60).length > 0 && (
              <div className="card" style={{ borderLeft: '3px solid var(--red)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)', marginBottom: '10px' }}>⚠️ Dikkat Gerektiren Öğrenciler (%60 altı)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {students.filter(s => s.avgPct !== null && s.avgPct < 60).map(s => (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Son: {timeAgo(s.lastActive)}</div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--red)' }}>%{s.avgPct}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ÖĞRENCİLER */}
        {activeTab === 'students' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)' }}>👥 Öğrencilerim</h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                  style={{ padding: '7px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-sans)', outline: 'none' }}>
                  <option value="all">Tüm Sınıflar</option>
                  {classrooms.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => router.push('/teacher/students')} className="btn btn-sm">+ Sınıf Yönet</button>
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
                <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Bu sınıfta öğrenci yok.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filteredStudents.sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1)).map(s => (
                  <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0, overflow: 'hidden' }}>
                      {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {s.grade && <span>📚 {s.grade}</span>}
                        <span>📝 {s.totalTests} test</span>
                        <span>✅ {s.assignmentsDone} ödev</span>
                        {s.streak > 0 && <span>🔥 {s.streak} gün</span>}
                        <span style={{ color: 'var(--text4)' }}>{timeAgo(s.lastActive)}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '20px', color: pctColor(s.avgPct) }}>
                        {s.avgPct !== null ? `%${s.avgPct}` : '—'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text4)' }}>ortalama</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ÖDEV ATA */}
        {activeTab === 'assign' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>📝 Ödev Ata</h2>
            <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '1rem' }}>Gelişmiş ödev atama sayfasına git</p>
              <Link href="/teacher/assign" className="btn btn-primary" style={{ justifyContent: 'center' }}>
                Ödev Atama Sayfası →
              </Link>
            </div>

            {/* Son ödevler listesi */}
            {assignments.length > 0 && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>Son Ödevler</div>
                {assignments.map((a: any) => (
                  <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{a.title}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {a.topic} · {a.question_count} soru
                        {a.due_date && ` · Son: ${new Date(a.due_date).toLocaleDateString('tr-TR')}`}
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', flexShrink: 0, marginLeft: '10px' }}>
                      {a.assignment_completions?.[0]?.count ?? 0} tamamladı
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ANALİZ */}
        {activeTab === 'performance' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)' }}>📈 Öğrenci Analizi</h2>
              <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-sans)', outline: 'none' }}>
                <option value="all">Tüm Sınıflar</option>
                {classrooms.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Dağılım */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                { label: 'İyi (%70+)', count: filteredStudents.filter(s => (s.avgPct ?? 0) >= 70).length, color: 'var(--green)', bg: 'var(--green-bg)' },
                { label: 'Orta (%50-69)', count: filteredStudents.filter(s => (s.avgPct ?? 0) >= 50 && (s.avgPct ?? 0) < 70).length, color: '#f59e0b', bg: 'rgba(245,158,11,0.08)' },
                { label: 'Zayıf (%50 altı)', count: filteredStudents.filter(s => s.avgPct !== null && s.avgPct < 50).length, color: 'var(--red)', bg: 'var(--red-bg)' },
              ].map((g, i) => (
                <div key={i} style={{ padding: '16px', borderRadius: '12px', background: g.bg, textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '28px', color: g.color }}>{g.count}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px', fontWeight: 600 }}>{g.label}</div>
                </div>
              ))}
            </div>

            {/* Detaylı analiz */}
            <div className="card">
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>Öğrenci Bazlı Performans</div>
              {filteredStudents.sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1)).map((s, idx) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ width: 28, textAlign: 'center', fontSize: '13px', color: 'var(--text4)', fontWeight: 700 }}>{idx + 1}.</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                      {s.totalTests} test · {s.assignmentsDone} ödev
                      {s.lastTopic && ` · Son: ${s.lastTopic}`}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div style={{ width: '80px' }}>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${s.avgPct ?? 0}%`, background: pctColor(s.avgPct), borderRadius: '3px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '16px', color: pctColor(s.avgPct), width: '42px', textAlign: 'right' }}>
                    {s.avgPct !== null ? `%${s.avgPct}` : '—'}
                  </div>
                </div>
              ))}
              {filteredStudents.length === 0 && (
                <div style={{ fontSize: '13px', color: 'var(--text3)', textAlign: 'center', padding: '2rem' }}>Öğrenci bulunamadı.</div>
              )}
            </div>

            {/* Gelişmiş analiz */}
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <Link href="/teacher/performance" className="btn" style={{ justifyContent: 'center', fontSize: '13px' }}>
                Gelişmiş Performans Raporu →
              </Link>
            </div>
          </div>
        )}

        {/* BİLDİRİM */}
        {activeTab === 'notify' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1.5rem' }}>🔔 Bildirim Gönder</h2>

            <div className="card" style={{ marginBottom: '1rem' }}>
              {/* Hızlı şablonlar */}
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Hızlı Şablonlar</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '1rem' }}>
                {[
                  { label: "📢 Yeni ödev", text: "Yeni bir ödeviniz var! Pratium'a girerek kontrol edin." },
                  { label: '🔥 Streak hatırlatıcı', text: 'Bugün test çözmeyi unutma! Streakini koru 🔥' },
                  { label: "📊 Sınav yaklaşıyor", text: "Sınav tarihine az kaldi. Pratiumda pratik yapmaya devam et!" },
                  { label: '🏆 Tebrik', text: 'Bu haftaki performansın harika! Gurur duyduk.' },
                ].map((t, i) => (
                  <button key={i} onClick={() => setNotifyMsg(t.text)}
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Sınıf seç */}
              <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Sınıf</label>
              <select value={notifyClass} onChange={e => setNotifyClass(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', marginBottom: '12px' }}>
                <option value="">Tüm sınıflarım</option>
                {classrooms.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              {/* Mesaj */}
              <label style={{ fontSize: '12px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>Mesaj</label>
              <textarea value={notifyMsg} onChange={e => setNotifyMsg(e.target.value)}
                placeholder="Öğrencilerinize göndermek istediğiniz mesajı yazın..."
                rows={4}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box', marginBottom: '12px' }} />

              {notifyResult && (
                <div style={{ padding: '10px 14px', borderRadius: '10px', background: notifyResult.startsWith('✅') ? 'var(--green-bg)' : 'var(--red-bg)', fontSize: '13px', color: notifyResult.startsWith('✅') ? 'var(--green)' : 'var(--red)', marginBottom: '12px' }}>
                  {notifyResult}
                </div>
              )}

              <button disabled={!notifyMsg.trim() || notifySending} onClick={async () => {
                setNotifySending(true); setNotifyResult('')
                try {
                  const { data: { session: ns } } = await supabase.auth.getSession()
                  const res = await fetch('/api/teacher/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ns?.access_token}` },
                    body: JSON.stringify({ classroom_id: notifyClass || null, message: notifyMsg }),
                  })
                  const data = await res.json()
                  if (data.error) { setNotifyResult(`❌ ${data.error}`); return }
                  setNotifyResult(`✅ ${data.recipientCount ?? 0} öğrenciye bildirim gönderildi!`)
                  setNotifyMsg('')
                  // Geçmişi yenile
                  const { data: hist } = await supabase.from('teacher_notifications').select('*, classrooms(name)').eq('teacher_id', teacher?.id).order('created_at', { ascending: false }).limit(10)
                  setNotifyHistory(hist ?? [])
                } catch { setNotifyResult('❌ Bir hata oluştu.') }
                setNotifySending(false)
              }} className="btn btn-primary" style={{ justifyContent: 'center', opacity: (!notifyMsg.trim() || notifySending) ? 0.5 : 1 }}>
                {notifySending ? '⏳ Gönderiliyor...' : '🔔 Bildirimi Gönder'}
              </button>
            </div>

            {/* Geçmiş */}
            {notifyHistory.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>📋 Geçmiş Bildirimler</div>
                {notifyHistory.map((n: any) => (
                  <div key={n.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.5 }}>{n.message}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text4)', marginTop: '4px', display: 'flex', gap: '8px' }}>
                      <span>{n.classrooms?.name || 'Tüm sınıflar'}</span>
                      <span>·</span>
                      <span>{new Date(n.created_at).toLocaleDateString('tr-TR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
