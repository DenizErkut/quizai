'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface LeaderEntry {
  id: string; name: string; grade: string
  points: number; streak: number; total_tests: number; avg_pct: number; rank: number
}

export default function LeaderboardPage() {
  const router = useRouter()
  const [entries, setEntries] = useState<LeaderEntry[]>([])
  const [myRank, setMyRank] = useState<LeaderEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'all' | 'weekly'>('all')
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data } = await supabase
        .from('leaderboard')
        .select('*')
        .order('points', { ascending: false })
        .limit(50)

      setEntries(data || [])
      const me = (data || []).find((e: LeaderEntry) => e.id === user.id)
      setMyRank(me || null)
      setLoading(false)
    }
    load()
  }, [])

  function medalEmoji(rank: number) {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  function gradeShort(grade: string) {
    if (!grade) return '?'
    if (grade.includes('ilk')) return 'İlk'
    if (grade.includes('orta')) return 'Orta'
    if (grade.includes('lise')) return 'Lise'
    return 'Üni'
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div className="anim-up" style={{ marginBottom: '2rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Sıralama</div>
          <h1 className="serif" style={{ fontSize: '28px' }}>Leaderboard</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '4px' }}>
            Puan kazan, sıralamada yüksel.
          </p>
        </div>

        {/* Kendi sıran */}
        {myRank && (
          <div className="card anim-up-1" style={{ marginBottom: '1rem', background: 'var(--accent-bg)', border: '1.5px solid rgba(91,76,245,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)', minWidth: '40px', textAlign: 'center' }}>
                {medalEmoji(myRank.rank)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '15px' }}>{myRank.name} (sen)</div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>
                  {gradeShort(myRank.grade)} · {myRank.total_tests} test · ort. %{myRank.avg_pct}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--accent)' }}>{myRank.points}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>puan</div>
              </div>
              {myRank.streak > 0 && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '16px' }}>🔥</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{myRank.streak}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top 3 */}
        {entries.length >= 3 && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: '8px', marginBottom: '1rem', alignItems: 'flex-end' }} className="anim-up-2">
            {[entries[1], entries[0], entries[2]].map((e, i) => (
              <div key={e.id} style={{
                padding: '16px 10px', borderRadius: '12px', textAlign: 'center',
                background: i === 1 ? 'linear-gradient(135deg,#1a1200,#2a2000)' : 'var(--bg2)',
                border: `1px solid ${i === 1 ? 'rgba(201,168,76,0.4)' : 'var(--border)'}`,
              }}>
                <div style={{ fontSize: i === 1 ? '36px' : '28px' }}>{i === 1 ? '🥇' : i === 0 ? '🥈' : '🥉'}</div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: i === 1 ? '#C9A84C' : 'var(--text)', marginTop: '4px' }}>{e.points}</div>
                <div style={{ fontSize: '10px', color: 'var(--text3)' }}>puan</div>
              </div>
            ))}
          </div>
        )}

        {/* Full list */}
        <div className="card anim-up-3" style={{ padding: 0, overflow: 'hidden' }}>
          {entries.map((e, i) => {
            const isMe = myRank?.id === e.id
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
                    {gradeShort(e.grade)} · {e.total_tests} test · ort. %{e.avg_pct}
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
          {entries.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text2)', fontSize: '14px' }}>
              Henüz sıralama yok. Test çöz, puan kazan!
            </div>
          )}
        </div>

        <div className="card-sm anim-up-4" style={{ marginTop: '1rem', fontSize: '12px', color: 'var(--text3)', textAlign: 'center', lineHeight: 1.8 }}>
          Her doğru cevap 10 puan · Günlük streak bonusu · Yüksek skor bonusu
        </div>
      </div>
    </main>
  )
}
