'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface User {
  id: string; name: string; grade: string; plan: string
  plan_expires_at: string | null; monthly_test_count: number
  is_admin: boolean; created_at: string; total_sessions?: number; avg_pct?: number
}

interface Stats {
  total_users: number; premium_users: number; free_users: number
  total_sessions: number; sessions_today: number; avg_score: number
}

interface Teacher {
  id: string; user_id: string; name: string; email: string
  school: string | null; approved: boolean; created_at: string
}

interface ErrorReport {
  id: string; user_id: string; question_text: string
  correct_answer: string; user_answer: string; topic: string
  reported_at: string; status: string; admin_note: string | null
  profiles?: { name: string }
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [errorReports, setErrorReports] = useState<ErrorReport[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [tab, setTab] = useState<'users' | 'stats' | 'errors' | 'teachers' | 'institutions' | 'meb'>('users')
  // Kurum formu
  // MEB Kaynakları state
  const [mebResources, setMebResources] = useState<any[]>([])
  const [mebLoading, setMebLoading] = useState(false)
  const [mebUploading, setMebUploading] = useState(false)
  const [mebForm, setMebForm] = useState({
    title: '', grade: '', subject: '', unit: '', level: 'ortaokul', raw_text: ''
  })
  const [mebFile, setMebFile] = useState<File | null>(null)
  const [mebMsg, setMebMsg] = useState('')
  const [mebFilter, setMebFilter] = useState({ level: '', subject: '' })

  const [instForm, setInstForm] = useState({ name: '', email: '', password: '', code: '', discount: '0' })
  const [instSaving, setInstSaving] = useState(false)
  const [instError, setInstError] = useState('')
  const [instSuccess, setInstSuccess] = useState('')
  const [institutions, setInstitutions] = useState<any[]>([])
  const [editingInst, setEditingInst] = useState<any>(null)
  const [editInstForm, setEditInstForm] = useState({ name: '', email: '', newPassword: '', discount: '0', active: true })
  const [editInstSaving, setEditInstSaving] = useState(false)
  const [instStudentCounts, setInstStudentCounts] = useState<Record<string, number>>({})
  const [adminNote, setAdminNote] = useState<Record<string, string>>({})
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [pendingTeachers, setPendingTeachers] = useState(0)
  const [teacherUpdating, setTeacherUpdating] = useState<string | null>(null)
  const supabase = createClient() as any

  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()

      if (!profile?.is_admin) { router.push('/quiz'); return }

      setIsAdmin(true)
      await fetchData()
    }
    load()
  }, [])

  async function generateInstCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase() +
           Math.random().toString(36).substring(2, 6).toUpperCase()
  }

  async function updateInstitution() {
    if (!editingInst) return
    setEditInstSaving(true)
    const { data: { session: s } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/update-institution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s?.access_token}` },
      body: JSON.stringify({ institution_id: editingInst.id, ...editInstForm }),
    })
    const json = await res.json()
    if (json.error) { alert(json.error); setEditInstSaving(false); return }
    setEditingInst(null)
    await fetchData()
    setEditInstSaving(false)
  }

  async function toggleInstitutionActive(inst: any) {
    const { data: { session: s } } = await supabase.auth.getSession()
    await fetch('/api/admin/update-institution', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${s?.access_token}` },
      body: JSON.stringify({ institution_id: inst.id, name: inst.name, email: inst.admin_email, newPassword: '', discount: String(inst.discount_rate || 0), active: !inst.active }),
    })
    await fetchData()
  }

  async function createInstitution() {
    if (!instForm.name.trim() || !instForm.email.trim() || !instForm.password || !instForm.code.trim()) {
      setInstError('Kurum adı, mail, şifre ve kod zorunlu.')
      return
    }
    setInstSaving(true); setInstError(''); setInstSuccess('')

    // 1. Auth hesabı oluştur
    const { data: authData, error: authErr } = await supabase.auth.admin
      ? await fetch('/api/admin/create-institution', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify(instForm),
        }).then(r => r.json())
      : { error: 'Admin API yok' }

    if (authData?.error) { setInstError(authData.error); setInstSaving(false); return }

    setInstSuccess(`Kurum "${instForm.name}" oluşturuldu! Kod: ${instForm.code}`)
    setInstForm({ name: '', email: '', password: '', code: '', discount: '0' })
    await fetchData()
    setInstSaving(false)
  }

  async function fetchData() {
    setLoading(true)
    // Kullanıcıları service role API üzerinden çek
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${session?.access_token}` }
    })
    const profileData = res.ok ? await res.json() : []

    // Her kullanıcının session istatistiklerini çek
    const { data: sessionData } = await supabase
      .from('quiz_sessions')
      .select('user_id, pct')
      .eq('completed', true)

    // auth.users'dan email çek (service role gerekir — şimdilik profiles'dan)
    const userMap: Record<string, { count: number; total_pct: number }> = {}
    sessionData?.forEach((s: any) => {
      if (!userMap[s.user_id]) userMap[s.user_id] = { count: 0, total_pct: 0 }
      userMap[s.user_id].count++
      userMap[s.user_id].total_pct += s.pct || 0
    })

    const enriched = (profileData || []).map((p: any) => ({
      ...p,
      total_sessions: userMap[p.id]?.count || 0,
      avg_pct: userMap[p.id]?.count
        ? Math.round(userMap[p.id].total_pct / userMap[p.id].count)
        : 0,
    }))
    setUsers(enriched)

    // Genel istatistikler
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { count: todaySessions } = await supabase
      .from('quiz_sessions')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', today.toISOString())

    setStats({
      total_users: enriched.length,
      premium_users: enriched.filter((u: User) => u.plan === 'premium').length,
      free_users: enriched.filter((u: User) => u.plan === 'free').length,
      total_sessions: sessionData?.length || 0,
      sessions_today: todaySessions || 0,
      avg_score: sessionData?.length
        ? Math.round(sessionData.reduce((s: number, x: any) => s + (x.pct || 0), 0) / sessionData.length)
        : 0,
    })

    // Hata bildirimleri
    const { data: reports } = await supabase
      .from('error_reports')
      .select('*, profiles(name)')
      .order('reported_at', { ascending: false })
    setErrorReports(reports || [])
    setPendingCount((reports || []).filter((r: ErrorReport) => r.status === 'pending').length)

    // Öğretmen başvurularını çek
    // service_role ile tüm öğretmenleri çek (RLS bypass)
    const { data: { session: adminSession } } = await supabase.auth.getSession()
    const teachersRes = await fetch('/api/admin/teachers', {
      headers: { 'Authorization': `Bearer ${adminSession?.access_token}` }
    })
    const teachersJson = await teachersRes.json()
    const teacherData = teachersJson.teachers || []
    setTeachers(teacherData)
    setPendingTeachers(teacherData.filter((t: Teacher) => !t.approved).length)

    // Kurumları çek (service_role ile)
    const instRes = await fetch('/api/admin/institutions', {
      headers: { 'Authorization': `Bearer ${adminSession?.access_token}` }
    })
    if (instRes.ok) {
      const instJson = await instRes.json()
      setInstitutions(instJson.institutions || [])
      setInstStudentCounts(instJson.counts || {})
    } else {
      // Fallback: direkt supabase'den çek
      const { data: instDirect } = await supabase
        .from('institutions').select('*').order('created_at', { ascending: false })
      setInstitutions(instDirect || [])
    }

    setLoading(false)
  }

  async function updateReportStatus(id: string, status: string, note?: string) {
    await supabase.from('error_reports').update({ status, admin_note: note || null }).eq('id', id)
    setErrorReports(prev => prev.map(r => r.id === id ? { ...r, status, admin_note: note || null } : r))
    if (status !== 'pending') setPendingCount(prev => Math.max(0, prev - 1))
  }

  async function updatePlan(userId: string, plan: 'free' | 'premium', months?: number) {
    setUpdating(userId)
    try {
      // ✅ Service role ile güncelle — client-side RLS bypass için API route
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/update-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ userId, plan, months }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(`Hata: ${data.error}`)
        return
      }
      const expires = data.expires
      setUsers(prev => prev.map(u => u.id === userId
        ? { ...u, plan, plan_expires_at: expires }
        : u))
    } catch(e: any) {
      alert(`Bağlantı hatası: ${e.message}`)
    } finally {
      setUpdating(null)
    }
  }

  async function resetTestCount(userId: string) {
    setUpdating(userId)
    await supabase.from('profiles')
      .update({ monthly_test_count: 0 })
      .eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, monthly_test_count: 0 } : u))
    setUpdating(null)
  }

  async function makeAllPremium(months: number) {
    if (!confirm(`Tüm free kullanıcıları ${months} ay premium yapılsın mı?`)) return
    setLoading(true)
    const expires = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('profiles')
      .update({ plan: 'premium', plan_expires_at: expires, monthly_test_count: 0 })
      .eq('plan', 'free')
    await fetchData()
  }

  async function toggleAdmin(userId: string, current: boolean) {
    if (!confirm(`Bu kullanıcıyı ${current ? 'admin\'den çıkar' : 'admin yap'}?`)) return
    await supabase.from('profiles').update({ is_admin: !current }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_admin: !current } : u))
  }

  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.grade.toLowerCase().includes(search.toLowerCase())
    const matchPlan = planFilter === 'all' || u.plan === planFilter
    return matchSearch && matchPlan
  })

  async function approveTeacher(teacherId: string) {
    setTeacherUpdating(teacherId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/approve-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ teacher_id: teacherId, action: 'approve' }),
      })
      if (res.ok) {
        setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, approved: true } : t))
        setPendingTeachers(prev => Math.max(0, prev - 1))
      }
    } catch (e) {
      alert('Hata oluştu')
    }
    setTeacherUpdating(null)
  }

  async function deleteTeacher(teacherId: string) {
    if (!confirm('Bu başvuruyu reddetmek istediğine emin misin? Öğretmene bildirim emaili gönderilecek.')) return
    setTeacherUpdating(teacherId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/approve-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ teacher_id: teacherId, action: 'reject' }),
      })
      if (res.ok) {
        const target = teachers.find(t => t.id === teacherId)
        setTeachers(prev => prev.filter(t => t.id !== teacherId))
        if (target && !target.approved) setPendingTeachers(prev => Math.max(0, prev - 1))
      }
    } catch (e) {
      alert('Hata oluştu')
    }
    setTeacherUpdating(null)
  }

  if (loading || !isAdmin) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <div>
            <div className="badge badge-purple" style={{ marginBottom: '6px' }}>Admin Panel</div>
            <h1 className="serif" style={{ fontSize: '28px' }}>QuizAI Yönetim</h1>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-sm" onClick={fetchData}>↺ Yenile</button>
            <button className="btn btn-sm" onClick={() => router.push('/quiz')}>← Uygulamaya dön</button>
          </div>
        </div>

        {/* Tab */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
          {([
            { key: 'users', label: '👥 Kullanıcılar' },
            { key: 'stats', label: '📊 İstatistikler' },
            { key: 'errors', label: `⚠️ Hata Bildirimleri${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
            { key: 'teachers', label: `🎓 Öğretmen Başvuruları${pendingTeachers > 0 ? ` (${pendingTeachers})` : ''}` },
            { key: 'institutions', label: '🏛️ Kurumlar' },
            { key: 'meb', label: '📚 MEB Kaynakları' },
          ] as const).map(t => (
            <button key={t.key} className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`}
              onClick={() => setTab(t.key)}
              style={
                tab !== t.key && t.key === 'errors' && pendingCount > 0 ? { borderColor: 'var(--red)', color: 'var(--red)' } :
                tab !== t.key && t.key === 'teachers' && pendingTeachers > 0 ? { borderColor: '#fdd31d', color: '#082465' } :
                {}
              }>
              {t.label}
            </button>
          ))}
        </div>

        {/* Stats tab */}
        {tab === 'stats' && stats && (
          <div className="anim-up">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '1.5rem' }}>
              {[
                { label: 'Toplam kullanıcı', value: stats.total_users, color: 'var(--accent)' },
                { label: 'Premium', value: stats.premium_users, color: 'var(--green)' },
                { label: 'Ücretsiz', value: stats.free_users, color: 'var(--text2)' },
                { label: 'Toplam test', value: stats.total_sessions, color: 'var(--accent)' },
                { label: 'Bugün test', value: stats.sessions_today, color: 'var(--amber)' },
                { label: 'Ort. skor', value: `%${stats.avg_score}`, color: stats.avg_score >= 70 ? 'var(--green)' : 'var(--red)' },
              ].map((s, i) => (
                <div key={i} className="card-sm" style={{ textAlign: 'center' }}>
                  <div className="serif" style={{ fontSize: '32px', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Plan dağılımı */}
            <div className="card">
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Plan dağılımı</div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ flex: 1, height: '24px', borderRadius: '99px', overflow: 'hidden', background: 'var(--bg2)', display: 'flex' }}>
                  <div style={{ width: `${(stats.premium_users / Math.max(stats.total_users, 1)) * 100}%`, background: 'var(--accent)', transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{stats.premium_users} Premium</span>
                  {' / '}
                  <span>{stats.free_users} Ücretsiz</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Users tab */}
        {tab === 'users' && (
          <div className="anim-up">
            {/* Araçlar */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input className="input" placeholder="İsim veya sınıf ara..." value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ maxWidth: '240px' }} />
              <select className="input" value={planFilter} onChange={e => setPlanFilter(e.target.value)}
                style={{ maxWidth: '140px' }}>
                <option value="all">Tüm planlar</option>
                <option value="free">Ücretsiz</option>
                <option value="premium">Premium</option>
              </select>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button className="btn btn-sm" style={{ color: 'var(--green)', borderColor: 'rgba(22,163,74,0.3)' }}
                  onClick={() => makeAllPremium(1)}>
                  ★ Hepsini 1 ay premium yap
                </button>
                <button className="btn btn-sm" style={{ color: 'var(--accent)', borderColor: 'rgba(91,76,245,0.3)' }}
                  onClick={() => makeAllPremium(12)}>
                  ★ Hepsini 1 yıl premium yap
                </button>
              </div>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '0.75rem' }}>
              {filtered.length} kullanıcı gösteriliyor
            </div>

            {/* Tablo */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
                      {['Kullanıcı', 'Sınıf', 'Plan', 'Bu ay', 'Test / Ort.', 'Kayıt', 'İşlemler'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((u, i) => (
                      <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : undefined }}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: u.is_admin ? 'rgba(220,38,38,0.1)' : 'var(--accent-bg)', border: `1.5px solid ${u.is_admin ? 'var(--red)' : 'var(--accent)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: u.is_admin ? 'var(--red)' : 'var(--accent)', fontWeight: 600, fontSize: '11px', flexShrink: 0 }}>
                              {u.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500 }}>{u.name}</div>
                              {u.is_admin && <div style={{ fontSize: '10px', color: 'var(--red)' }}>Admin</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>{u.grade}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            fontSize: '11px', padding: '3px 8px', borderRadius: '99px', fontWeight: 600,
                            background: u.plan === 'premium' ? 'var(--accent-bg)' : 'var(--bg2)',
                            color: u.plan === 'premium' ? 'var(--accent)' : 'var(--text3)',
                            border: `1px solid ${u.plan === 'premium' ? 'rgba(91,76,245,0.2)' : 'var(--border)'}`,
                          }}>
                            {u.plan === 'premium' ? '★ Premium' : 'Ücretsiz'}
                          </span>
                          {u.plan_expires_at && (
                            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>
                              {new Date(u.plan_expires_at).toLocaleDateString('tr-TR')} kadar
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '12px', color: u.monthly_test_count >= 8 ? 'var(--red)' : 'var(--text2)' }}>
                            {u.monthly_test_count}/10
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text2)' }}>
                          {u.total_sessions} test
                          {u.total_sessions > 0 && <span style={{ color: u.avg_pct >= 70 ? 'var(--green)' : 'var(--red)', marginLeft: '4px' }}>%{u.avg_pct}</span>}
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text3)', fontSize: '11px' }}>
                          {new Date(u.created_at).toLocaleDateString('tr-TR')}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {u.plan === 'free' ? (
                              <>
                                <button
                                  disabled={updating === u.id}
                                  onClick={() => updatePlan(u.id, 'premium', 1)}
                                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  +1 ay
                                </button>
                                <button
                                  disabled={updating === u.id}
                                  onClick={() => updatePlan(u.id, 'premium', 3)}
                                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  +3 ay
                                </button>
                                <button
                                  disabled={updating === u.id}
                                  onClick={() => updatePlan(u.id, 'premium', 12)}
                                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  +1 yıl
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  disabled={updating === u.id}
                                  onClick={() => updatePlan(u.id, 'premium', 1)}
                                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  +1 ay
                                </button>
                                <button
                                  disabled={updating === u.id}
                                  onClick={() => updatePlan(u.id, 'premium', 3)}
                                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  +3 ay
                                </button>
                                <button
                                  disabled={updating === u.id}
                                  onClick={() => updatePlan(u.id, 'premium', 12)}
                                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  +1 yıl
                                </button>
                                <button
                                  disabled={updating === u.id}
                                  onClick={() => updatePlan(u.id, 'free')}
                                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer' }}>
                                  Free'ye al
                                </button>
                              </>
                            )}
                            <button
                              disabled={updating === u.id}
                              onClick={() => resetTestCount(u.id)}
                              style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', cursor: 'pointer' }}
                              title="Test sayacını sıfırla">
                              ↺
                            </button>
                            <button
                              onClick={() => toggleAdmin(u.id, u.is_admin)}
                              style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: `1px solid ${u.is_admin ? 'rgba(220,38,38,0.3)' : 'var(--border)'}`, background: u.is_admin ? 'var(--red-bg)' : 'var(--bg2)', color: u.is_admin ? 'var(--red)' : 'var(--text3)', cursor: 'pointer' }}
                              title={u.is_admin ? 'Admin yetkisini kaldır' : 'Admin yap'}>
                              {u.is_admin ? '★' : '☆'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Teachers tab */}
        {tab === 'teachers' && (
          <div className="card anim-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>
                {pendingTeachers > 0
                  ? <span style={{ color: '#d97706' }}>⏳ {pendingTeachers} bekleyen başvuru</span>
                  : <span style={{ color: 'var(--green)' }}>✓ Bekleyen başvuru yok</span>}
              </div>
            </div>
            {teachers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)' }}>
                Henüz öğretmen başvurusu yok.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {teachers.map(t => (
                  <div key={t.id} style={{
                    padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${t.approved ? 'var(--green)' : '#fdd31d'}`,
                    background: t.approved ? 'var(--green-bg)' : 'rgba(253,211,29,0.05)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: t.approved ? 'var(--gradient)' : 'rgba(253,211,29,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: t.approved ? '#fff' : '#082465', flexShrink: 0 }}>
                          {t.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{t.email}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginLeft: '40px' }}>
                        {t.school && <span>🏫 {t.school} · </span>}
                        <span>📅 {new Date(t.created_at).toLocaleDateString('tr-TR')}</span>
                        {' · '}
                        <span style={{ fontWeight: 600, color: t.approved ? 'var(--green)' : '#d97706' }}>
                          {t.approved ? '✓ Onaylandı' : '⏳ Bekliyor'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!t.approved && (
                        <button
                          onClick={() => approveTeacher(t.id)}
                          disabled={teacherUpdating === t.id}
                          style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'var(--gradient)', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: teacherUpdating === t.id ? 0.6 : 1 }}>
                          {teacherUpdating === t.id ? '...' : '✓ Onayla'}
                        </button>
                      )}
                      <button
                        onClick={() => deleteTeacher(t.id)}
                        disabled={teacherUpdating === t.id}
                        style={{ padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.3)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: teacherUpdating === t.id ? 0.6 : 1 }}>
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Institutions tab */}
        {tab === 'institutions' && (
          <div>
            {/* Kurum oluştur formu */}
            <div className="card" style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>🏛️ Yeni Kurum Oluştur</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Kurum Adı *</label>
                  <input className="input" placeholder="ABC Koleji" value={instForm.name}
                    onChange={e => setInstForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Kurum Kodu * (8 hane)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input className="input" placeholder="ABC12345" value={instForm.code}
                      onChange={e => setInstForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                      style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }} />
                    <button onClick={async () => {
                      const code = (Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 6)).toUpperCase()
                      setInstForm(p => ({ ...p, code }))
                    }} className="btn btn-sm" title="Otomatik üret" style={{ flexShrink: 0 }}>🎲</button>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>E-posta Adresi *</label>
                  <input className="input" type="email" placeholder="kurum@mail.com" value={instForm.email}
                    onChange={e => setInstForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Şifre *</label>
                  <input className="input" type="password" placeholder="En az 8 karakter" value={instForm.password}
                    onChange={e => setInstForm(p => ({ ...p, password: e.target.value }))} />
                </div>
              </div>

              <div style={{ marginBottom: '12px', maxWidth: '200px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>İndirim Oranı (%)</label>
                <input className="input" type="number" min={0} max={100} placeholder="0" value={instForm.discount}
                  onChange={e => setInstForm(p => ({ ...p, discount: e.target.value }))} />
              </div>

              {instError && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '8px', fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{instError}</div>}
              {instSuccess && <div style={{ padding: '10px 12px', background: 'var(--green-bg)', borderRadius: '8px', fontSize: '13px', color: 'var(--green)', marginBottom: '10px' }}>{instSuccess}</div>}

              <button onClick={createInstitution} disabled={instSaving} className="btn btn-primary"
                style={{ opacity: instSaving ? 0.6 : 1 }}>
                {instSaving ? '⏳ Oluşturuluyor...' : '🏛️ Kurumu Oluştur'}
              </button>
            </div>

            {/* Mevcut kurumlar */}
            {/* Düzenleme modalı */}
            {editingInst && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                <div className="card" style={{ width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>✏️ Kurumu Düzenle</div>
                    <button onClick={() => setEditingInst(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text3)' }}>×</button>
                  </div>

                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Kurum Adı</label>
                  <input className="input" value={editInstForm.name} onChange={e => setEditInstForm(p => ({ ...p, name: e.target.value }))} style={{ marginBottom: '10px' }} />

                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>E-posta</label>
                  <input className="input" type="email" value={editInstForm.email} onChange={e => setEditInstForm(p => ({ ...p, email: e.target.value }))} style={{ marginBottom: '10px' }} />

                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Yeni Şifre (boş bırakırsan değişmez)</label>
                  <input className="input" type="password" placeholder="Yeni şifre..." value={editInstForm.newPassword} onChange={e => setEditInstForm(p => ({ ...p, newPassword: e.target.value }))} style={{ marginBottom: '10px' }} />

                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>İndirim Oranı (%)</label>
                  <input className="input" type="number" min={0} max={100} value={editInstForm.discount} onChange={e => setEditInstForm(p => ({ ...p, discount: e.target.value }))} style={{ marginBottom: '10px' }} />

                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={editInstForm.active} onChange={e => setEditInstForm(p => ({ ...p, active: e.target.checked }))} style={{ width: 16, height: 16, accentColor: 'var(--accent)' }} />
                    <span style={{ fontSize: '13px', color: 'var(--text2)' }}>Kurum aktif</span>
                  </label>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={updateInstitution} disabled={editInstSaving} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                      {editInstSaving ? '⏳ Kaydediliyor...' : '💾 Kaydet'}
                    </button>
                    <button onClick={() => setEditingInst(null)} className="btn" style={{ justifyContent: 'center' }}>İptal</button>
                  </div>
                </div>
              </div>
            )}

            {/* Kurum listesi */}
            <div className="card">
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
                Mevcut Kurumlar ({institutions.length})
              </div>
              {institutions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text3)', fontSize: '13px' }}>Henüz kurum yok.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {institutions.map((inst: any) => (
                    <div key={inst.id} style={{ padding: '14px 16px', borderRadius: '12px', border: `1.5px solid ${inst.active ? 'var(--border)' : 'rgba(220,38,38,0.2)'}`, background: inst.active ? 'var(--bg)' : 'var(--red-bg)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>{inst.name}</span>
                            {!inst.active && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--red)', background: 'var(--red-bg)', padding: '2px 8px', borderRadius: '999px' }}>PASİF</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text3)' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}>#{inst.code}</span>
                            <span>📧 {inst.admin_email || '—'}</span>
                            <span>👥 {instStudentCounts[inst.id] ?? 0} öğrenci</span>
                            {inst.discount_rate > 0 && <span>🏷️ %{inst.discount_rate} indirim</span>}
                            <span>📅 {new Date(inst.created_at).toLocaleDateString('tr-TR')}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button onClick={() => {
                            setEditingInst(inst)
                            setEditInstForm({ name: inst.name, email: inst.admin_email || '', newPassword: '', discount: String(inst.discount_rate || 0), active: inst.active })
                          }} className="btn btn-sm" style={{ fontSize: '11px' }}>✏️ Düzenle</button>
                          <button onClick={() => toggleInstitutionActive(inst)}
                            className="btn btn-sm"
                            style={{ fontSize: '11px', color: inst.active ? 'var(--red)' : 'var(--green)', borderColor: inst.active ? 'rgba(220,38,38,0.3)' : 'rgba(22,163,74,0.3)', background: inst.active ? 'var(--red-bg)' : 'var(--green-bg)' }}>
                            {inst.active ? '🔴 Pasif Yap' : '🟢 Aktif Yap'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error reports tab */}
        {tab === 'errors' && (
          <div className="anim-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                {pendingCount > 0
                  ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>⚠ {pendingCount} bekleyen bildirim</span>
                  : '✓ Tüm bildirimler işlendi'}
              </div>
              <button className="btn btn-sm" onClick={fetchData}>↺ Yenile</button>
            </div>

            {errorReports.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text2)' }}>
                Henüz hata bildirimi yok.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {errorReports.map(r => (
                  <div key={r.id} className="card" style={{
                    borderLeft: `3px solid ${r.status === 'pending' ? 'var(--red)' : r.status === 'confirmed' ? 'var(--amber)' : 'var(--green)'}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '99px', fontWeight: 600, marginRight: '8px',
                          background: r.status === 'pending' ? 'var(--red-bg)' : r.status === 'confirmed' ? 'rgba(217,119,6,0.1)' : 'var(--green-bg)',
                          color: r.status === 'pending' ? 'var(--red)' : r.status === 'confirmed' ? 'var(--amber)' : 'var(--green)',
                        }}>
                          {r.status === 'pending' ? 'Bekliyor' : r.status === 'confirmed' ? 'Onaylandı' : 'Reddedildi'}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                          {(r as any).profiles?.name || 'Kullanıcı'} · {r.topic} · {new Date(r.reported_at).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                      {r.question_text}
                    </div>
                    <div style={{ fontSize: '12px', marginBottom: '8px', display: 'flex', gap: '16px' }}>
                      <span><span style={{ color: 'var(--red)' }}>✗ Kullanıcı:</span> {r.user_answer}</span>
                      <span><span style={{ color: 'var(--green)' }}>✓ Kayıtlı doğru:</span> {r.correct_answer}</span>
                    </div>

                    {r.admin_note && (
                      <div style={{ fontSize: '12px', color: 'var(--text2)', padding: '8px', background: 'var(--bg2)', borderRadius: '6px', marginBottom: '8px' }}>
                        Not: {r.admin_note}
                      </div>
                    )}

                    {r.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input
                          placeholder="Admin notu (opsiyonel)"
                          value={adminNote[r.id] || ''}
                          onChange={e => setAdminNote(prev => ({ ...prev, [r.id]: e.target.value }))}
                          style={{ flex: 1, fontSize: '12px', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-sans)', minWidth: '150px' }}
                        />
                        <button onClick={() => updateReportStatus(r.id, 'confirmed', adminNote[r.id])}
                          style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(217,119,6,0.3)', background: 'rgba(217,119,6,0.1)', color: 'var(--amber)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          ✓ Hata onaylandı
                        </button>
                        <button onClick={() => updateReportStatus(r.id, 'rejected', adminNote[r.id])}
                          style={{ fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          ✗ Ret (soru doğru)
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      {/* MEB KAYNAKLARI */}
      {tab === 'meb' && (
        <div>
          {/* Yükleme formu */}
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
              📤 Yeni Kaynak Yükle
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>Başlık *</label>
                <input value={mebForm.title} onChange={e => setMebForm(p => ({ ...p, title: e.target.value }))}
                  placeholder="6. Sınıf Fen - Hücre Ünitesi"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>Seviye *</label>
                <select value={mebForm.level} onChange={e => setMebForm(p => ({ ...p, level: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)' }}>
                  <option value="ilkokul">İlkokul</option>
                  <option value="ortaokul">Ortaokul</option>
                  <option value="lise">Lise</option>
                  <option value="universite">Üniversite</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>Sınıf *</label>
                <input value={mebForm.grade} onChange={e => setMebForm(p => ({ ...p, grade: e.target.value }))}
                  placeholder="ortaokul 6. sinif"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>Ders *</label>
                <input value={mebForm.subject} onChange={e => setMebForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Fen Bilimleri"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>Ünite *</label>
                <input value={mebForm.unit} onChange={e => setMebForm(p => ({ ...p, unit: e.target.value }))}
                  placeholder="Hücre ve Organeller"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* PDF veya metin */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>PDF Dosyası (opsiyonel)</label>
                <input type="file" accept=".pdf,.txt,.docx"
                  onChange={e => setMebFile(e.target.files?.[0] || null)}
                  style={{ width: '100%', fontSize: '12px', color: 'var(--text2)' }} />
                {mebFile && <div style={{ fontSize: '11px', color: 'var(--green)', marginTop: '4px' }}>✓ {mebFile.name} ({(mebFile.size / 1024 / 1024).toFixed(1)} MB)</div>}
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px' }}>Veya Metin İçeriği</label>
                <textarea value={mebForm.raw_text} onChange={e => setMebForm(p => ({ ...p, raw_text: e.target.value }))}
                  placeholder="Konu metnini buraya yapıştır..."
                  rows={4}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-sans)', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            </div>

            {mebMsg && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '10px', fontSize: '13px',
                background: mebMsg.startsWith('✅') ? 'var(--green-bg)' : 'var(--red-bg)',
                color: mebMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)',
                border: `1px solid ${mebMsg.startsWith('✅') ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}` }}>
                {mebMsg}
              </div>
            )}

            <button
              disabled={mebUploading || !mebForm.title || !mebForm.grade || !mebForm.subject || !mebForm.unit}
              onClick={async () => {
                setMebUploading(true)
                setMebMsg('')
                try {
                  let res: Response
                  let data: any

                  // Buyuk dosya: base64 ile API'ye gonder (service role key kullanir)
                  if (mebFile && mebFile.size > 4 * 1024 * 1024) {
                    setMebMsg("Dosya hazirlanıyor...")
                    const base64 = await new Promise<string>((resolve, reject) => {
                      const reader = new FileReader()
                      reader.onload = () => resolve((reader.result as string).split(',')[1])
                      reader.onerror = reject
                      reader.readAsDataURL(mebFile)
                    })
                    setMebMsg("PDF isleniyor...")
                    res = await fetch('/api/admin/meb-upload', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        file_base64: base64,
                        file_name: mebFile.name,
                        file_type: mebFile.type,
                        title: mebForm.title,
                        grade: mebForm.grade,
                        subject: mebForm.subject,
                        unit: mebForm.unit,
                        level: mebForm.level,
                      })
                    })
                  } else {
                    // Kucuk dosya veya metin → FormData
                    const fd = new FormData()
                    fd.append('title', mebForm.title)
                    fd.append('grade', mebForm.grade)
                    fd.append('subject', mebForm.subject)
                    fd.append('unit', mebForm.unit)
                    fd.append('level', mebForm.level)
                    fd.append('raw_text', mebForm.raw_text)
                    if (mebFile) fd.append('file', mebFile)
                    res = await fetch('/api/admin/meb-upload', { method: 'POST', body: fd })
                  }

                  data = await res.json()
                  if (res.ok) {
                    const warn = data.warning ? ` ⚠️ ${data.warning}` : ''
                    setMebMsg(`✅ Yüklendi! ${data.chunks} chunk, ${data.embedded} embedding, ${(data.chars/1000).toFixed(1)}K karakter${warn}`)
                    setMebForm({ title: '', grade: '', subject: '', unit: '', level: mebForm.level, raw_text: '' })
                    setMebFile(null)
                    // Listeyi yenile
                    const r2 = await fetch(`/api/admin/meb-upload?level=${mebFilter.level}&subject=${mebFilter.subject}`)
                    const d2 = await r2.json()
                    setMebResources(d2.resources || [])
                  } else {
                    setMebMsg(`❌ Hata: ${data.error}`)
                  }
                } catch (e: any) {
                  setMebMsg(`❌ ${e.message}`)
                } finally {
                  setMebUploading(false)
                }
              }}
              style={{ padding: '10px 20px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {mebUploading ? <><span className="spinner" style={{ width: 16, height: 16, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> Yükleniyor...</> : "📤 Yükle ve Chunkla"}
            </button>
          </div>

          {/* Kaynak listesi */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
                📚 Yüklü Kaynaklar ({mebResources.length})
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select value={mebFilter.level} onChange={async e => {
                  const level = e.target.value
                  setMebFilter(p => ({ ...p, level }))
                  setMebLoading(true)
                  const res = await fetch(`/api/admin/meb-upload?level=${level}&subject=${mebFilter.subject}`)
                  const data = await res.json()
                  setMebResources(data.resources || [])
                  setMebLoading(false)
                }} style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-sans)' }}>
                  <option value="">Tüm Seviyeler</option>
                  <option value="ilkokul">İlkokul</option>
                  <option value="ortaokul">Ortaokul</option>
                  <option value="lise">Lise</option>
                  <option value="universite">Üniversite</option>
                </select>
                <button onClick={async () => {
                  setMebLoading(true)
                  const res = await fetch(`/api/admin/meb-upload?level=${mebFilter.level}&subject=${mebFilter.subject}`)
                  const data = await res.json()
                  setMebResources(data.resources || [])
                  setMebLoading(false)
                }} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  🔄 Yenile
                </button>
              </div>
            </div>

            {mebLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div>
            ) : mebResources.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text3)' }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>📭</div>
                <div>Henüz kaynak yüklenmemiş. Yükle butonuna tıkla.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {mebResources.map((r: any) => (
                  <div key={r.id} style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{r.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <span>📚 {r.subject}</span>
                          <span>📖 {r.unit}</span>
                          <span>🎓 {r.grade}</span>
                          <span>📄 {r.source_type === 'pdf' ? 'PDF' : 'Metin'}</span>
                          <span>💬 {(r.char_count / 1000).toFixed(1)}K karakter</span>
                          <span>🗓️ {new Date(r.created_at).toLocaleDateString('tr-TR')}</span>
                        </div>
                        {r.preview && (
                          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '500px' }}>
                            {r.preview}...
                          </div>
                        )}
                      </div>
                      <button onClick={async () => {
                        if (!confirm(`"${r.title}" kaynağını silmek istediğine emin misin? Tüm chunk'lar da silinecek.`)) return
                        const res = await fetch('/api/admin/meb-upload', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id }) })
                        if (res.ok) setMebResources(prev => prev.filter((x: any) => x.id !== r.id))
                        else alert('Silme başarısız')
                      }} style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid rgba(220,38,38,0.3)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0, marginLeft: '12px' }}>
                        🗑️ Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      </div>
    </main>
  )
}
