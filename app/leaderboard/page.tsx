'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface LeaderEntry {
  id: string; name: string; grade: string
  points: number; streak: number; total_tests: number; avg_pct: number; rank: number
}

interface Badge {
  badge_key: string; earned_at: string
}

const BADGE_DEFS: Record<string, { icon: string; label: string; desc: string; color: string }> = {
  first_test:      { icon: '⚡', label: 'İlk Test',       desc: 'İlk testini tamamladın',              color: '#1ECFB8' },
  perfect_score:   { icon: '💯', label: 'Mükemmel',       desc: '100% başarı elde ettin',              color: '#F59E0B' },
  streak_3:        { icon: '🔥', label: '3 Günlük Seri',  desc: '3 gün üst üste test çözdün',          color: '#EF4444' },
  streak_7:        { icon: '🏆', label: 'Haftalık Seri',  desc: '7 gün üst üste test çözdün',          color: '#8B5CF6' },
  streak_30:       { icon: '👑', label: 'Aylık Seri',     desc: '30 gün üst üste test çözdün',         color: '#F59E0B' },
  tests_10:        { icon: '📚', label: '10 Test',        desc: '10 test tamamladın',                  color: '#16A34A' },
  tests_50:        { icon: '🎓', label: '50 Test',        desc: '50 test tamamladın',                  color: '#1ECFB8' },
  tests_100:       { icon: '🌟', label: '100 Test',       desc: '100 test tamamladın',                 color: '#F59E0B' },
  high_score_80:   { icon: '🎯', label: 'Keskin Nişancı', desc: 'Ortalama %80+ başarı',                color: '#EC4899' },
  plan_complete:   { icon: '📋', label: 'Plancı',         desc: 'Gelişim planını tamamladın',          color: '#16A34A' },
  referral:        { icon: '🎁', label: 'Davetçi',        desc: 'Bir arkadaşını davet ettin',          color: '#8B5CF6' },
}

function gradeGroup(grade: string): string {
  if (!grade) return 'diger'
  if (grade.startsWith('ilk')) return 'ilkokul'
  if (grade.startsWith('orta')) return 'ortaokul'
  if (grade.startsWith('lise')) return 'lise'
  if (grade.startsWith('uni')) return 'universite'
  return 'diger'
}

const GROUP_LABELS: Record<string, string> = {
  all: 'Genel',
  ilkokul: 'İlkokul',
  ortaokul: 'Ortaokul',
  lise: 'Lise',
  universite: 'Üniversite',
}

export default function LeaderboardPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<LeaderEntry[]>([])
  const [myEntry, setMyEntry] = useState<LeaderEntry | null>(null)
  const [myGrade, setMyGrade] = useState('')
  const [myBadges, setMyBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'leaderboard' | 'badges'>('leaderboard')
  const [group, setGroup] = useState<string>('all')
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: lb }, { data: profile }, { data: badges }] = await Promise.all([
        supabase.from('leaderboard').select('*').order('points', { ascending: false }).limit(200),
        supabase.from('profiles').select('grade').eq('id', user.id).single(),
        supabase.from('badges').select('badge_key, earned_at').eq('user_id', user.id),
      ])

      const allEntries = lb || []
      setEntries(allEntries)
      setMyEntry(allEntries.find((e: LeaderEntry) => e.id === user.id) || null)
      setMyGrade(profile?.grade || '')
      setMyBadges(badges || [])

      // Varsayılan tab: kendi sınıf grubu
      const g = gradeGroup(profile?.grade || '')
      setGroup(g !== 'diger' ? g : 'all')
      setLoading(false)
    }
    load()
  }, [])

  const filtered = group === 'all'
    ? entries
    : entries.filter(e => gradeGroup(e.grade) === group)

  // Filtrelenmiş listeye göre sıra yeniden hesapla
  const ranked = filtered.map((e, i) => ({ ...e, rank: i + 1 }))
  const myFiltered = ranked.find(e => e.id === myEntry?.id)

  function medalEmoji(rank: number) {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  const earnedKeys = new Set(myBadges.map(b => b.badge_key))

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div className="anim-up" style={{ marginBottom: '1.5rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Topluluk</div>
          <h1 className="serif" style={{ fontSize: '28px' }}>Sıralama & Rozetler</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '4px' }}>
            Test çöz, puan kazan, rozetler topla.
          </p>
        </div>

        {/* Tab seçici */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }} className="anim-up-1">
          {[['leaderboard', '🏆 Sıralama'], ['badges', '🎖 Rozetlerim']].map(([t, l]) => (
            <button key={t} onClick={() => setTab(t as any)}
              style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `1.5px solid ${tab === t ? 'var(--accent)' : 'var(--border)'}`, background: tab === t ? 'var(--accent-bg)' : 'var(--bg)', color: tab === t ? 'var(--accent)' : 'var(--text2)', fontWeight: tab === t ? 700 : 500, fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              {l}
            </button>
          ))}
        </div>

        {tab === 'leaderboard' && (
          <>
            {/* Sınıf grubu filtresi */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem' }} className="anim-up-1">
              {Object.entries(GROUP_LABELS).map(([key, label]) => (
                <button key={key} onClick={() => setGroup(key)}
                  style={{ padding: '6px 14px', borderRadius: '99px', border: `1.5px solid ${group === key ? 'var(--accent)' : 'var(--border)'}`, background: group === key ? 'var(--accent-bg)' : 'var(--bg)', color: group === key ? 'var(--accent)' : 'var(--text2)', fontSize: '13px', fontWeight: group === key ? 700 : 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                  {label}
                  {key !== 'all' && key === gradeGroup(myGrade) && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>• sen</span>}
                </button>
              ))}
            </div>

            {/* Kendi sıran */}
            {myFiltered && (
              <div className="card anim-up-1" style={{ marginBottom: '1rem', background: 'var(--accent-bg)', border: '1.5px solid rgba(30,207,184,0.25)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)', minWidth: '40px', textAlign: 'center' }}>
                    {medalEmoji(myFiltered.rank)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{myFiltered.name} <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 400 }}>(sen)</span></div>
                    <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>
                      {myFiltered.grade} · {myFiltered.total_tests} test · ort. %{myFiltered.avg_pct}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent)' }}>{myFiltered.points}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>puan</div>
                  </div>
                  {myFiltered.streak > 0 && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '18px' }}>🔥</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{myFiltered.streak}</div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {myBadges.slice(0, 5).map(b => (
                    <span key={b.badge_key} style={{ fontSize: '18px' }} title={BADGE_DEFS[b.badge_key]?.label}>
                      {BADGE_DEFS[b.badge_key]?.icon || '🎖'}
                    </span>
                  ))}
                  {myBadges.length > 5 && <span style={{ fontSize: '12px', color: 'var(--text3)', alignSelf: 'center' }}>+{myBadges.length - 5}</span>}
                </div>
              </div>
            )}

            {/* Top 3 */}
            {ranked.length >= 3 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '8px', marginBottom: '1rem', alignItems: 'flex-end' }} className="anim-up-2">
                {[ranked[1], ranked[0], ranked[2]].map((e, i) => (
                  <div key={e.id} style={{
                    padding: '16px 10px', borderRadius: '14px', textAlign: 'center',
                    background: i === 1 ? 'linear-gradient(135deg, #071220, #0A1E2C)' : 'var(--bg2)',
                    border: `1.5px solid ${i === 1 ? 'rgba(30,207,184,0.4)' : 'var(--border)'}`,
                  }}>
                    <div style={{ fontSize: i === 1 ? '38px' : '28px' }}>{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: i === 1 ? '#fff' : 'var(--text)' }}>{e.name}</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: i === 1 ? '#1ECFB8' : 'var(--text)', marginTop: '4px' }}>{e.points}</div>
                    <div style={{ fontSize: '10px', color: i === 1 ? 'rgba(255,255,255,0.5)' : 'var(--text3)' }}>puan</div>
                  </div>
                ))}
              </div>
            )}

            {/* Full list */}
            <div className="card anim-up-3" style={{ padding: 0, overflow: 'hidden' }}>
              {ranked.map((e, i) => {
                const isMe = myEntry?.id === e.id
                return (
                  <div key={e.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px',
                    borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                    background: isMe ? 'var(--accent-bg)' : 'transparent',
                  }}>
                    <div style={{ fontSize: e.rank <= 3 ? '18px' : '13px', fontWeight: 600, color: e.rank <= 3 ? undefined : 'var(--text3)', minWidth: '32px', textAlign: 'center' }}>
                      {medalEmoji(e.rank)}
                    </div>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: isMe ? 'var(--accent)' : 'var(--bg2)', border: `1px solid ${isMe ? 'var(--accent)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, color: isMe ? '#fff' : 'var(--text2)', flexShrink: 0 }}>
                      {e.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: isMe ? 600 : 400, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.name}{isMe ? ' (sen)' : ''}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                        {e.grade} · {e.total_tests} test · ort. %{e.avg_pct}
                      </div>
                    </div>
                    {e.streak > 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                        🔥 {e.streak}
                      </div>
                    )}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: isMe ? 'var(--accent)' : 'var(--text)' }}>{e.points}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)' }}>pt</div>
                    </div>
                  </div>
                )
              })}
              {ranked.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text2)', fontSize: '14px' }}>
                  Bu grupta henüz sıralama yok. Test çöz, ilk sen ol!
                </div>
              )}
            </div>

            <div className="card-sm anim-up-4" style={{ marginTop: '1rem', fontSize: '12px', color: 'var(--text3)', textAlign: 'center', lineHeight: 1.8 }}>
              Her doğru cevap 10 puan · Günlük streak bonusu · Yüksek skor bonusu
            </div>
          </>
        )}

        {tab === 'badges' && (
          <div className="anim-up-1">
            {/* Kazanılan rozetler */}
            {myBadges.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                  Kazandıkların ({myBadges.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '10px' }}>
                  {myBadges.map(b => {
                    const def = BADGE_DEFS[b.badge_key]
                    if (!def) return null
                    return (
                      <div key={b.badge_key} style={{ padding: '14px', borderRadius: '12px', background: `${def.color}12`, border: `1.5px solid ${def.color}30`, textAlign: 'center' }}>
                        <div style={{ fontSize: '32px', marginBottom: '6px' }}>{def.icon}</div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: def.color, marginBottom: '2px' }}>{def.label}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)', lineHeight: 1.4 }}>{def.desc}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>
                          {new Date(b.earned_at).toLocaleDateString('tr-TR')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tüm rozetler */}
            <div className="card">
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1rem' }}>
                Tüm rozetler
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(BADGE_DEFS).map(([key, def]) => {
                  const earned = earnedKeys.has(key)
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', borderRadius: '12px', background: earned ? `${def.color}10` : 'var(--bg2)', border: `1.5px solid ${earned ? def.color + '30' : 'var(--border)'}`, opacity: earned ? 1 : 0.5 }}>
                      <div style={{ fontSize: '28px', flexShrink: 0 }}>{def.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: earned ? def.color : 'var(--text2)' }}>{def.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{def.desc}</div>
                      </div>
                      {earned
                        ? <span style={{ fontSize: '11px', color: def.color, fontWeight: 600 }}>✓ Kazanıldı</span>
                        : <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Kilitli</span>
                      }
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
