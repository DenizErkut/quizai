'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function InstitutionPage() {
  const [institution, setInstitution] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'list' | 'leaderboard' | 'profile'>('list')
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login/institution'); return }

    // service_role ile admin kontrolü
    const { data: { session } } = await supabase.auth.getSession()
    const checkRes = await fetch('/api/institution/check-admin', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const checkJson = await checkRes.json()
    if (!checkJson.isAdmin) { router.push('/login/institution'); return }

    // Kurum bilgisi — service_role ile
    const instRes = await fetch('/api/institution/data', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const instJson = await instRes.json()
    if (!instJson.institution) { router.push('/login/institution'); return }

    setInstitution(instJson.institution)
    setStudents(instJson.students || [])

    // İstatistikler
    const studentData = instJson.students || []
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
    if (pct >= 70) return 'var(--green)'
    if (pct >= 50) return '#f59e0b'
    return 'var(--red)'
  }

  const filtered = students
    .filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.grade?.toLowerCase().includes(search.toLowerCase()))

  const leaderboard = [...students]
    .filter(s => s.totalTests > 0)
    .sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Kurum Navbar — sadece bu sayfada */}
      <nav style={{ background: '#082465', padding: '0 1.5rem', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '32px', filter: 'brightness(0) invert(1)' }} />
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500 }}>🏛️ {institution?.name}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {[
            { key: 'list', label: '👥 Öğrenciler' },
            { key: 'leaderboard', label: '🏆 Liderlik' },
            { key: 'profile', label: '⚙️ Profil' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                background: activeTab === t.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: activeTab === t.key ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>
              {t.label}
            </button>
          ))}
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', marginLeft: '8px' }}>
            Çıkış
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem', paddingBottom: '5rem' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>
              {activeTab === 'list' ? '👥 Öğrenci Listesi' : activeTab === 'leaderboard' ? '🏆 Liderlik Tablosu' : '⚙️ Kurum Profili'}
            </h1>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '12px' }}>
              <span>Kod: <strong style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{institution?.code}</strong></span>
              {institution?.discount_rate > 0 && <span>🏷️ %{institution.discount_rate} indirim</span>}
            </div>
          </div>
        </div>

        {/* Özet kartlar */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
            {[
              { icon: '👥', label: 'Kayıtlı Öğrenci', value: stats.total, color: 'var(--primary)' },
              { icon: '⚡', label: 'Aktif Öğrenci', value: stats.active, color: 'var(--accent)' },
              { icon: '📊', label: 'Genel Ortalama', value: stats.overallAvg ? `%${stats.overallAvg}` : '—', color: pctColor(stats.overallAvg) },
              { icon: '🔥', label: 'En Uzun Seri', value: stats.topStreaker?.streak ? `${stats.topStreaker.streak} gün` : '—', sub: stats.topStreaker?.name?.split(' ')[0], color: '#f97316' },
              { icon: '🏆', label: 'En Yüksek Puan', value: stats.topScorer?.avgPct ? `%${stats.topScorer.avgPct}` : '—', sub: stats.topScorer?.name?.split(' ')[0], color: 'var(--green)' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
                <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
                <div style={{ fontWeight: 800, fontSize: '18px', color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
                {(s as any).sub && <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '1px' }}>{(s as any).sub}</div>}
              </div>
            ))}
          </div>
        )}



        {/* Arama */}
        <div style={{ marginBottom: '1rem' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Öğrenci ara..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' }} />
        </div>

        {/* Öğrenci Listesi */}
        {activeTab === 'list' && (
          filtered.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
              <div style={{ fontSize: '14px', color: 'var(--text2)', fontWeight: 600, marginBottom: '8px' }}>
                {students.length === 0 ? 'Henüz kayıtlı öğrenci yok' : 'Sonuç bulunamadı'}
              </div>
              {students.length === 0 && (
                <div style={{ fontSize: '13px', color: 'var(--text3)', lineHeight: 1.6 }}>
                  Öğrencilerinize kurum kodunu paylaşın:<br/>
                  <strong style={{ fontFamily: 'monospace', fontSize: '18px', color: 'var(--accent)', letterSpacing: '0.1em' }}>{institution?.code}</strong>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filtered.map((s: any) => (
                <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0, overflow: 'hidden' }}>
                    {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)' }}>{s.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {s.grade && <span>📚 {s.grade}</span>}
                      <span>📝 {s.totalTests} test</span>
                      {s.streak > 0 && <span>🔥 {s.streak} gün</span>}
                      <span style={{ color: 'var(--text4)', fontSize: '10px' }}>
                        {s.lastActive ? `Son: ${new Date(s.lastActive).toLocaleDateString('tr-TR')}` : 'Henüz aktif değil'}
                      </span>
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
          )
        )}

        {/* Liderlik Tablosu */}
        {activeTab === 'leaderboard' && (
          leaderboard.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏆</div>
              <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Henüz test çözen öğrenci yok.</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaderboard.map((s: any, idx: number) => (
                <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', borderLeft: idx < 3 ? '3px solid' : undefined, borderLeftColor: idx === 0 ? '#F59E0B' : idx === 1 ? '#94A3B8' : '#B45309' }}>
                  <div style={{ width: 36, textAlign: 'center', fontSize: idx < 3 ? '22px' : '14px', fontWeight: 700, color: 'var(--text4)', flexShrink: 0 }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                  </div>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: idx === 0 ? 'linear-gradient(135deg, #F59E0B, #FDD31D)' : 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0, overflow: 'hidden' }}>
                    {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                      <span>{s.totalTests} test</span>
                      {s.streak > 0 && <span>🔥 {s.streak} gün</span>}
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '22px', color: pctColor(s.avgPct), flexShrink: 0 }}>
                    %{s.avgPct}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Profil sekmesi */}
        {activeTab === 'profile' && (
          <div>
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
                    <div style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: (item as any).mono ? 'monospace' : undefined, letterSpacing: (item as any).mono ? '0.08em' : undefined }}>
                      {item.value || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>📊 Genel Durum</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                  { label: 'Toplam Öğrenci', value: stats?.total ?? 0 },
                  { label: 'Aktif Öğrenci', value: stats?.active ?? 0 },
                  { label: 'Genel Ortalama', value: stats?.overallAvg ? `%${stats.overallAvg}` : '—' },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '14px', background: 'var(--bg2)', borderRadius: '10px' }}>
                    <div style={{ fontWeight: 800, fontSize: '22px', color: 'var(--primary)' }}>{s.value}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
