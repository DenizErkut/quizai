'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface User {
  id: string
  name: string
  email?: string
  grade: string
  plan: string
  plan_expires_at: string | null
  monthly_test_count: number
  is_admin: boolean
  created_at: string
  total_sessions?: number
  avg_pct?: number
}

interface Stats {
  total_users: number
  premium_users: number
  free_users: number
  total_sessions: number
  sessions_today: number
  avg_score: number
}

export default function AdminPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [updating, setUpdating] = useState<string | null>(null)
  const [tab, setTab] = useState<'users' | 'stats'>('users')
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Admin kontrolü
      const { data: profile } = await supabase
        .from('profiles').select('is_admin').eq('id', user.id).single()
      if (!profile?.is_admin) { router.push('/'); return }

      await fetchData()
    }
    load()
  }, [])

  async function fetchData() {
    setLoading(true)
    // Kullanıcıları çek
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, name, grade, plan, plan_expires_at, monthly_test_count, is_admin, created_at')
      .order('created_at', { ascending: false })

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
    setLoading(false)
  }

  async function updatePlan(userId: string, plan: 'free' | 'premium', months?: number) {
    setUpdating(userId)
    const expires = plan === 'premium' && months
      ? new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()
      : null

    await supabase.from('profiles').update({
      plan,
      plan_expires_at: expires,
      monthly_test_count: plan === 'free' ? 0 : undefined,
    }).eq('id', userId)

    setUsers(prev => prev.map(u => u.id === userId
      ? { ...u, plan, plan_expires_at: expires }
      : u))
    setUpdating(null)
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

  if (loading) return (
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
          {(['users', 'stats'] as const).map(t => (
            <button key={t} className={`btn btn-sm ${tab === t ? 'btn-primary' : ''}`}
              onClick={() => setTab(t)}>
              {t === 'users' ? '👥 Kullanıcılar' : '📊 İstatistikler'}
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
                                  onClick={() => updatePlan(u.id, 'premium', 12)}
                                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid rgba(22,163,74,0.3)', background: 'var(--green-bg)', color: 'var(--green)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  +1 yıl
                                </button>
                              </>
                            ) : (
                              <button
                                disabled={updating === u.id}
                                onClick={() => updatePlan(u.id, 'free')}
                                style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer' }}>
                                Free'ye al
                              </button>
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
      </div>
    </main>
  )
}
