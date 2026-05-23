'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function TeacherDashboard() {
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [stats, setStats] = useState({ totalStudents: 0, activeAssignments: 0, avgPct: 0 })
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)
  const [applyForm, setApplyForm] = useState({ name: '', school: '' })
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: t } = await supabase
      .from('teachers')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (!t) { setLoading(false); return }
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
      .limit(5)

    setClassrooms(cls ?? [])
    setAssignments(asgn ?? [])

    const totalStudents = (cls ?? []).reduce((acc: number, c: any) => acc + (c.classroom_students?.[0]?.count || 0), 0)
    const activeAssignments = (asgn ?? []).filter((a: any) => !a.due_date || new Date(a.due_date) > new Date()).length

    setStats({ totalStudents, activeAssignments, avgPct: 0 })
    setLoading(false)
  }

  async function applyAsTeacher() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !applyForm.name.trim()) return
    setApplying(true)
    await supabase.from('teachers').insert({
      user_id: user.id,
      name: applyForm.name.trim(),
      email: user.email,
      school: applyForm.school.trim(),
      approved: false,
    })
    setApplying(false)
    load()
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text3)', fontSize: '14px' }}>Yükleniyor...</div>
    </main>
  )

  // Başvuru formu
  if (!teacher) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <div className="card">
          <div style={{ fontSize: '40px', marginBottom: '1rem' }}>🎓</div>
          <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Öğretmen Paneline Başvur</h1>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Başvurun admin tarafından onaylandıktan sonra panele erişebilirsin.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              placeholder="Adın Soyadın"
              value={applyForm.name}
              onChange={e => setApplyForm(p => ({ ...p, name: e.target.value }))}
              style={inputStyle}
            />
            <input
              placeholder="Okul adı (isteğe bağlı)"
              value={applyForm.school}
              onChange={e => setApplyForm(p => ({ ...p, school: e.target.value }))}
              style={inputStyle}
            />
            <button
              className="btn btn-primary"
              onClick={applyAsTeacher}
              disabled={applying || !applyForm.name.trim()}
              style={{ justifyContent: 'center', opacity: applying ? 0.6 : 1 }}
            >
              {applying ? 'Gönderiliyor...' : 'Başvur'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )

  // Onay bekleniyor
  if (!teacher.approved) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '40px', marginBottom: '1rem' }}>⏳</div>
          <h1 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Başvurun İnceleniyor</h1>
          <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
            Başvurun onaylandığında e-posta alacaksın. Genellikle 24 saat içinde sonuçlanır.
          </p>
        </div>
      </div>
    </main>
  )

  // Ana dashboard
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        {/* Başlık */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Öğretmen Paneli</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Hoş geldin, {teacher.name}</p>
        </div>

        {/* İstatistikler */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
          {[
            { label: 'Toplam Öğrenci', value: stats.totalStudents, icon: '👥' },
            { label: 'Aktif Ödev', value: stats.activeAssignments, icon: '📝' },
            { label: 'Sınıf', value: classrooms.length, icon: '🏫' },
          ].map(s => (
            <div key={s.label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
              <div style={{ fontSize: '24px', marginBottom: '6px' }}>{s.icon}</div>
              <div style={{ fontSize: '22px', fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Hızlı erişim */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.5rem' }}>
          {[
            { href: '/teacher/students', icon: '👥', label: 'Öğrenci Yönetimi', desc: 'Sınıf oluştur, öğrenci ekle' },
            { href: '/teacher/assign', icon: '📝', label: 'Ödev Ata', desc: 'Test ve konu ata' },
            { href: '/teacher/performance', icon: '📊', label: 'Performans', desc: 'Öğrenci analizleri' },
            { href: '/teacher/notify', icon: '🔔', label: 'Bildirim Gönder', desc: 'Toplu mesaj gönder' },
          ].map(item => (
            <Link key={item.href} href={item.href}
              style={{ textDecoration: 'none' }}
            >
              <div className="card" style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,149,200,0.4)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>{item.icon}</div>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.label}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{item.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Son ödevler */}
        {assignments.length > 0 && (
          <div className="card">
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Son Ödevler
            </div>
            {assignments.map((a: any) => (
              <div key={a.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{a.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                    {a.topic} · {a.question_count} soru
                    {a.due_date && ` · ${new Date(a.due_date).toLocaleDateString('tr-TR')}'e kadar`}
                  </div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                  {a.assignment_completions?.[0]?.count || 0} tamamladı
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--border)',
  background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
