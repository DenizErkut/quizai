'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'

export default function InstitutionPage() {
  const [institution, setInstitution] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'analytics' | 'risk' | 'profile'>('overview')
  const [sortBy, setSortBy] = useState<'name' | 'avgPct' | 'totalTests' | 'streak'>('avgPct')
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login/institution'); return }

    const { data: { session } } = await supabase.auth.getSession()
    const checkRes = await fetch('/api/institution/check-admin', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const checkJson = await checkRes.json()
    if (!checkJson.isAdmin) { router.push('/login/institution'); return }

    const instRes = await fetch('/api/institution/data', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const instJson = await instRes.json()
    if (!instJson.institution) { router.push('/login/institution'); return }

    setInstitution(instJson.institution)
    const studentData = instJson.students || []
    setStudents(studentData)
    setAnalytics(instJson.analytics || null)

    const active = studentData.filter((s: any) => s.totalTests > 0)
    const overallAvg = active.length
      ? Math.round(active.reduce((a: number, s: any) => a + (s.avgPct ?? 0), 0) / active.length) : 0
    setStats({
      total: studentData.length,
      active: active.length,
      overallAvg,
      topStreaker: [...studentData].sort((a: any, b: any) => b.streak - a.streak)[0],
      topScorer: [...studentData].sort((a: any, b: any) => (b.avgPct ?? 0) - (a.avgPct ?? 0))[0],
    })
    setLoading(false)
  }

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct >= 70) return '#16a34a'
    if (pct >= 50) return '#d97706'
    return '#dc2626'
  }

  const filtered = students
    .filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.grade?.toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => {
      if (sortBy === 'name') return a.name?.localeCompare(b.name)
      if (sortBy === 'avgPct') return (b.avgPct ?? -1) - (a.avgPct ?? -1)
      if (sortBy === 'totalTests') return b.totalTests - a.totalTests
      if (sortBy === 'streak') return b.streak - a.streak
      return 0
    })

  const leaderboard = [...students].filter(s => s.totalTests > 0).sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))

  const TABS = [
    { key: 'overview',   label: '📊 Genel Bakış' },
    { key: 'students',   label: '👥 Öğrenciler' },
    { key: 'analytics',  label: '📈 Analitik' },
    { key: 'risk',       label: `⚠️ Risk${analytics?.riskStudents?.length ? ` (${analytics.riskStudents.length})` : ''}` },
    { key: 'profile',    label: '⚙️ Profil' },
  ]

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Navbar */}
      <nav style={{ background: '#082465', padding: '0 1.5rem', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '28px', filter: 'brightness(0) invert(1)' }} />
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500 }}>🏛️ {institution?.name}</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center', overflowX: 'auto' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', transition: 'all 0.15s',
                background: activeTab === t.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: activeTab === t.key ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>
              {t.label}
            </button>
          ))}
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', marginLeft: '4px', whiteSpace: 'nowrap' }}>
            Çıkış
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1.5rem', paddingBottom: '5rem' }}>

        {/* ── GENEL BAKIŞ ─────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>
              Kurum Paneli
            </h1>

            {/* KPI Kartları */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                { icon: '👥', label: 'Kayıtlı', value: stats?.total ?? 0, color: '#6366f1' },
                { icon: '⚡', label: 'Aktif', value: stats?.active ?? 0, color: '#0891b2', sub: 'test çözdü' },
                { icon: '📊', label: 'Ort. Başarı', value: stats?.overallAvg ? `%${stats.overallAvg}` : '—', color: pctColor(stats?.overallAvg) },
                { icon: '📝', label: 'Bu Hafta', value: analytics?.thisWeekTests ?? 0, color: '#7c3aed', sub: `önceki: ${analytics?.prevWeekTests ?? 0}` },
                { icon: '⚠️', label: 'Risk', value: analytics?.riskStudents?.length ?? 0, color: '#dc2626', sub: 'öğrenci' },
              ].map((s, i) => (
                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 10px', cursor: s.label === 'Risk' ? 'pointer' : undefined }}
                  onClick={() => s.label === 'Risk' && setActiveTab('risk')}>
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: '20px', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
                  {s.sub && <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '1px' }}>{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* Haftalık Trend Mini */}
            {analytics?.weeklyTrend && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>📈 Haftalık Test Trendi</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={analytics.weeklyTrend}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="tests" name="Test Sayısı" stroke="#6366f1" fill="url(#trendGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top 5 Liderlik */}
            <div className="card">
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>🏆 Top 5 Öğrenci</div>
              {leaderboard.slice(0, 5).map((s: any, i: number) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <div style={{ fontSize: i < 3 ? '18px' : '13px', fontWeight: 700, width: 28, textAlign: 'center', color: 'var(--text3)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </div>
                  <div style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--primary)' }}>{s.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{s.grade}</div>
                  <div style={{ fontWeight: 800, fontSize: '15px', color: pctColor(s.avgPct) }}>%{s.avgPct}</div>
                </div>
              ))}
              {leaderboard.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text3)', textAlign: 'center', padding: '1rem' }}>Henüz test çözen öğrenci yok.</div>}
            </div>
          </div>
        )}

        {/* ── ÖĞRENCİLER ─────────────────────────────────────────────────── */}
        {activeTab === 'students' && (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', flex: 1 }}>👥 Öğrenciler</h1>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '12px', fontFamily: 'var(--font-sans)' }}>
                <option value="avgPct">Başarıya Göre</option>
                <option value="totalTests">Test Sayısına Göre</option>
                <option value="streak">Seriye Göre</option>
                <option value="name">İsme Göre</option>
              </select>
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="🔍 Öğrenci veya sınıf ara..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }} />

            {filtered.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
                <div style={{ fontSize: '14px', color: 'var(--text2)', fontWeight: 600 }}>
                  {students.length === 0 ? 'Henüz kayıtlı öğrenci yok' : 'Sonuç bulunamadı'}
                </div>
                {students.length === 0 && (
                  <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '8px', lineHeight: 1.6 }}>
                    Kurum kodunu paylaşın:<br />
                    <strong style={{ fontFamily: 'monospace', fontSize: '20px', color: '#6366f1', letterSpacing: '0.1em' }}>{institution?.code}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtered.map((s: any) => (
                  <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0, overflow: 'hidden' }}>
                      {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {s.grade && <span>📚 {s.grade}</span>}
                        <span>📝 {s.totalTests} test</span>
                        {s.streak > 0 && <span>🔥 {s.streak} gün</span>}
                        {s.weeklyTests > 0 && <span style={{ color: '#16a34a' }}>+{s.weeklyTests} bu hafta</span>}
                        <span style={{ color: 'var(--text4)', fontSize: '10px' }}>
                          {s.lastActive ? `Son: ${new Date(s.lastActive).toLocaleDateString('tr-TR')}` : 'Aktif değil'}
                        </span>
                      </div>
                      {s.weakTopics?.length > 0 && (
                        <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {s.weakTopics.map((t: any) => (
                            <span key={t.topic} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)' }}>
                              ⚠️ {t.topic.slice(0, 12)} %{t.avg}
                            </span>
                          ))}
                        </div>
                      )}
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

        {/* ── ANALİTİK ────────────────────────────────────────────────────── */}
        {activeTab === 'analytics' && analytics && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>📈 Detaylı Analitik</h1>

            {/* Sınıf bazlı kırılım */}
            {analytics.gradeBreakdown?.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>📚 Sınıf Bazlı Başarı</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={analytics.gradeBreakdown} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="grade" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v: any) => [`%${v}`, 'Ortalama']} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="avgPct" name="Ortalama" radius={[6, 6, 0, 0]}>
                      {analytics.gradeBreakdown.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.avgPct >= 70 ? '#16a34a' : entry.avgPct >= 50 ? '#d97706' : '#dc2626'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {analytics.gradeBreakdown.map((g: any) => (
                    <div key={g.grade} style={{ padding: '6px 10px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{g.grade}</span>
                      <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>{g.count} öğrenci · {g.tests} test</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Haftalık test trendi */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>📈 8 Haftalık Test & Başarı Trendi</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={analytics.weeklyTrend}>
                  <defs>
                    <linearGradient id="testGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pctGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="tests" name="Test Sayısı" stroke="#6366f1" fill="url(#testGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="avgPct" name="Ortalama %" stroke="#16a34a" fill="url(#pctGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Konu haritası */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '12px' }}>⚠️ Zayıf Konular</div>
                {analytics.weakTopics?.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Zayıf konu yok! 🎉</div>}
                {analytics.weakTopics?.map((t: any, i: number) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 500 }}>{t.topic}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>%{t.avg}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.avg}%`, background: '#dc2626', borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '2px' }}>{t.count} test</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a', marginBottom: '12px' }}>✅ Güçlü Konular</div>
                {analytics.strongTopics?.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Henüz yeterli veri yok.</div>}
                {analytics.strongTopics?.map((t: any, i: number) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 500 }}>{t.topic}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>%{t.avg}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.avg}%`, background: '#16a34a', borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '2px' }}>{t.count} test</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── RİSK ALARMI ─────────────────────────────────────────────────── */}
        {activeTab === 'risk' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>⚠️ Risk Alarmı</h1>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.25rem' }}>
              7+ gün aktif olmayan veya ortalaması %40 altında olan öğrenciler
            </p>

            {!analytics?.riskStudents?.length ? (
              <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>Risk altında öğrenci yok!</div>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '8px' }}>Tüm öğrenciler aktif ve başarılı görünüyor.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analytics.riskStudents.map((s: any) => {
                  const daysSince = s.lastActive
                    ? Math.floor((Date.now() - new Date(s.lastActive).getTime()) / 86400000)
                    : null
                  return (
                    <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', borderLeft: '3px solid #dc2626' }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #dc2626, #ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                        {s.name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)' }}>{s.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {s.grade && <span>📚 {s.grade}</span>}
                          {s.reason === 'inactive'
                            ? <span style={{ color: '#d97706' }}>⏰ {daysSince !== null ? `${daysSince} gündür aktif değil` : 'Hiç aktif olmadı'}</span>
                            : <span style={{ color: '#dc2626' }}>📉 Ortalama %{s.avgPct}</span>
                          }
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '18px', color: pctColor(s.avgPct) }}>
                          {s.avgPct !== null ? `%${s.avgPct}` : '—'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600, marginTop: '2px' }}>
                          {s.reason === 'inactive' ? 'İnaktif' : 'Düşük Puan'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PROFİL ──────────────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>⚙️ Kurum Profili</h1>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>🏛️ Kurum Bilgileri</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                {[
                  { label: 'Kurum Adı', value: institution?.name },
                  { label: 'Kurum Kodu', value: institution?.code, mono: true },
                  { label: 'E-posta', value: institution?.admin_email },
                  { label: 'İndirim Oranı', value: institution?.discount_rate ? `%${institution.discount_rate}` : 'Yok' },
                  { label: 'Durum', value: institution?.active ? '✅ Aktif' : '🔴 Pasif' },
                  { label: 'Kayıt Tarihi', value: institution?.created_at ? new Date(institution.created_at).toLocaleDateString('tr-TR') : '—' },
                ].map((item, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: (item as any).mono ? 'monospace' : undefined }}>
                      {item.value || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>📋 Kurum Kodu Paylaş</div>
              <div style={{ padding: '20px', background: 'var(--bg2)', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>Öğrenciler kayıt sırasında bu kodu kullanacak</div>
                <div style={{ fontFamily: 'monospace', fontSize: '32px', fontWeight: 900, color: '#6366f1', letterSpacing: '0.15em' }}>{institution?.code}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>pratium.com/register</div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
