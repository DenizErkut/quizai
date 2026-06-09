'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Session { id: string; topic: string; grade: string; score: number; pct: number; question_count: number; created_at: string }
interface Profile { name: string; grade: string; language: string; plan: string }
interface DashStats { total_count: number; total_correct: number; total_questions: number; avg_pct: number; best_pct: number; weak_count: number }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' })
}

function pctColor(p: number) { return p >= 80 ? '#16a34a' : p >= 50 ? '#d97706' : '#dc2626' }
function pctBg(p: number) { return p >= 80 ? 'rgba(22,163,74,0.12)' : p >= 50 ? 'rgba(217,119,6,0.12)' : 'rgba(220,38,38,0.12)' }

// Okulyo stilinde menü ikonları
const menuItems = [
  { href: '/quiz',      icon: '⚡', label: 'Test Çöz',      color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
  { href: '/analysis',  icon: '📊', label: 'Analizim',      color: '#0ea5e9', bg: 'rgba(14,165,233,0.12)' },
  { href: '/archive',   icon: '🗂️', label: 'Arşivim',       color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  { href: '/plan',      icon: '📋', label: 'Çalışma Planı', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  { href: '/leaderboard',icon: '🏆', label: 'Sıralama',     color: '#f43f5e', bg: 'rgba(244,63,94,0.12)' },
  { href: '/daily',     icon: '🔥', label: 'Günlük Test',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  { href: '/pdf-tools', icon: '🛠️', label: 'PDF Araçları',  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  { href: '/report',    icon: '📈', label: 'Raporlarım',    color: '#06b6d4', bg: 'rgba(6,182,212,0.12)' },
  { href: '/classes',   icon: '🏫', label: 'Sınıflarım',    color: '#84cc16', bg: 'rgba(132,204,22,0.12)' },
]

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [stats, setStats] = useState<DashStats>({ total_count: 0, total_correct: 0, total_questions: 0, avg_pct: 0, best_pct: 0, weak_count: 0 })
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const [greeting, setGreeting] = useState('Merhaba')

  useEffect(() => {
    const h = new Date().getHours()
    if (h < 12) setGreeting('Günaydın')
    else if (h < 18) setGreeting('İyi günler')
    else setGreeting('İyi akşamlar')

    async function load() {
      const supabase = createClient() as any
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: p }, { data: s }, { data: dashStats }, { data: sk }] = await Promise.all([
        supabase.from('profiles').select('name,grade,language,plan').eq('id', user.id).single(),
        // Son 5 test — sadece ihtiyaç duyulan alanlar
        supabase.from('quiz_sessions')
          .select('id,topic,grade,score,pct,question_count,created_at')
          .eq('user_id', user.id).eq('completed', true)
          .order('created_at', { ascending: false }).limit(5),
        // Tüm istatistikler tek sorguda — aggregate RPC
        supabase.rpc('get_dashboard_stats', { p_user_id: user.id }),
        supabase.from('streaks').select('current_streak').eq('user_id', user.id).maybeSingle(),
      ])

      setProfile(p)
      setSessions(s || [])
      setStats(dashStats || { total_count: 0, total_correct: 0, total_questions: 0, avg_pct: 0, best_pct: 0, weak_count: 0 })
      setStreak(sk?.current_streak || 0)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <main style={{ minHeight: '100vh', background: '#082465', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ borderTopColor: '#fdd31d', borderColor: 'rgba(253,211,29,0.2)' }} />
    </main>
  )

  const avgPct = stats.avg_pct
  const firstName = profile?.name?.split(' ')[0] || ''
  const initials = profile?.name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase() || 'U'

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>

      {/* ── HERO HEADER (Okulyo stili) ── */}
      <div style={{
        background: 'linear-gradient(135deg, #082465 0%, #0d3b8e 60%, #1ECFB8 100%)',
        padding: '2rem 1.5rem 3.5rem',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Dekoratif daireler */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', bottom: -20, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(30,207,184,0.15)' }} />
        <div style={{ position: 'absolute', top: 20, right: 80, width: 60, height: 60, borderRadius: '50%', background: 'rgba(253,211,29,0.1)' }} />

        <div style={{ maxWidth: '480px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Avatar */}
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: 'linear-gradient(135deg, #fdd31d, #f5a623)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '18px', fontWeight: 800, color: '#082465',
                border: '3px solid rgba(255,255,255,0.3)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              }}>
                {initials}
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>
                  {greeting} 👋
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>
                  {firstName}
                </div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                  {profile?.grade}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {profile?.plan === 'premium' && (
                <div style={{ padding: '4px 10px', borderRadius: '99px', background: 'rgba(253,211,29,0.2)', border: '1px solid rgba(253,211,29,0.4)', fontSize: '11px', fontWeight: 700, color: '#fdd31d' }}>
                  ★ Premium
                </div>
              )}
              <Link href="/quiz" style={{
                padding: '8px 16px', borderRadius: '99px',
                background: '#fdd31d', color: '#082465',
                fontSize: '12px', fontWeight: 800,
                display: 'flex', alignItems: 'center', gap: '4px',
                boxShadow: '0 4px 12px rgba(253,211,29,0.4)',
              }}>
                ⚡ Test
              </Link>
            </div>
          </div>

          {/* İstatistik kartları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            {[
              { label: 'Test', value: stats.total_count, icon: '📝' },
              { label: 'Ort.', value: `%${avgPct}`, icon: '📊' },
              { label: 'Soru', value: stats.total_questions, icon: '❓' },
              { label: 'Seri', value: `🔥${streak}`, icon: '' },
            ].map((s, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)',
                borderRadius: '14px', padding: '10px 8px', textAlign: 'center',
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginTop: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MENÜ GRİD (Okulyo stili) ── */}
      <div style={{ maxWidth: '480px', margin: '-1.5rem auto 0', padding: '0 1.25rem', position: 'relative', zIndex: 2 }}>
        <div style={{
          background: 'var(--bg)',
          borderRadius: '24px 24px 0 0',
          padding: '1.5rem 1.25rem',
          boxShadow: '0 -4px 24px rgba(8,36,101,0.08)',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '1.5rem' }}>
            {menuItems.map((item, i) => (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                  padding: '16px 8px', borderRadius: '16px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  transition: 'all 0.15s',
                  cursor: 'pointer',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = item.bg; e.currentTarget.style.borderColor = item.color + '40' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg2)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '14px',
                    background: item.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px',
                  }}>
                    {item.icon}
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.3 }}>
                    {item.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Son testler */}
          {sessions.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>Son Testler</div>
                <Link href="/archive" style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>Tümü →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sessions.map((s, i) => (
                  <Link key={s.id} href={`/archive/${s.id}`} style={{ textDecoration: 'none' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px', borderRadius: '14px',
                      background: 'var(--bg2)', border: '1px solid var(--border)',
                      transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(8,36,101,0.2)'; e.currentTarget.style.background = 'var(--bg3)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg2)' }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '12px',
                        background: pctBg(s.pct),
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: pctColor(s.pct), lineHeight: 1 }}>%{s.pct}</span>
                        <span style={{ fontSize: '9px', color: pctColor(s.pct), opacity: 0.7 }}>{s.score}/{s.question_count}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{formatDate(s.created_at)}</div>
                      </div>
                      <span style={{ color: 'var(--text4)', fontSize: '14px' }}>›</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {sessions.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📝</div>
              <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)', marginBottom: '6px' }}>Henüz test çözmedin</div>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.25rem' }}>İlk testini çöz, analizini gör!</div>
              <Link href="/quiz" className="btn btn-primary" style={{ display: 'inline-flex', justifyContent: 'center' }}>
                ⚡ İlk Testimi Çöz
              </Link>
            </div>
          )}

          <div style={{ marginTop: '1.25rem', padding: '12px 14px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(8,36,101,0.04), rgba(30,207,184,0.04))', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>Toplam {stats.total_correct}/{stats.total_questions} doğru</span>
            <Link href="/quiz" className="btn btn-primary btn-sm">Yeni Test ⚡</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
