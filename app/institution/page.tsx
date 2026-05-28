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
  const [activeTab, setActiveTab] = useState<'list' | 'leaderboard'>('list')
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
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>🏛️ Kurum Paneli</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: 'var(--primary)' }}>
              {institution?.name}
            </h1>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span>Kod: <strong style={{ fontFamily: 'monospace', letterSpacing: '0.08em', color: 'var(--accent)' }}>{institution?.code}</strong></span>
              {institution?.discount_rate > 0 && <span>🏷️ %{institution.discount_rate} indirim</span>}
            </div>
          </div>
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            Çıkış Yap
          </button>
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

        {/* Sekmeler */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
          {[
            { key: 'list', label: `👥 Öğrenci Listesi (${students.length})` },
            { key: 'leaderboard', label: `🏆 Liderlik Tablosu` },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: '8px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                background: activeTab === t.key ? '#082465' : 'var(--bg2)',
                borderColor: activeTab === t.key ? '#082465' : 'var(--border)',
                color: activeTab === t.key ? '#fff' : 'var(--text3)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

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

      </div>
    </main>
  )
}
