'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LANGS = [
  { code: 'Türkçe', flag: '🇹🇷' },
  { code: 'English', flag: '🇬🇧' },
  { code: 'Deutsch', flag: '🇩🇪' },
  { code: 'Français', flag: '🇫🇷' },
  { code: 'Español', flag: '🇪🇸' },
  { code: 'العربية', flag: '🇸🇦' },
]

const MENU_ITEMS = [
  { label: '⚡ Yeni test', href: '/quiz' },
  { label: '📅 Günlük test', href: '/daily' },
  { label: '📊 Dashboard', href: '/dashboard' },
  { label: '📈 Analiz', href: '/analysis' },
  { label: '📋 Gelişim planı', href: '/plan' },
  { label: '🏆 Sıralama', href: '/leaderboard' },
  { label: '✏️ Profil düzenle', href: '/profile/edit' },
  { label: '📝 Notlarım', href: '/notes' },
  { label: '🗂️ Soru arşivi', href: '/archive' },
  { label: '💎 Planlar', href: '/pricing' },
  { label: '🎁 Davet et & kazan', href: '/referral' },
  { label: '🎓 Öğretmen paneli', href: '/teacher' },
  { label: '🔑 Şifremi değiştir', href: '/auth/reset-password' },
]

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [streak, setStreak] = useState(0)
  const [showLang, setShowLang] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('name,plan,monthly_test_count,language,referral_code').eq('id', user.id).single(),
        supabase.from('streaks').select('current_streak').eq('user_id', user.id).single(),
      ])
      if (p) {
        const stored = localStorage.getItem('pratium_lang')
        if (stored) p.language = stored
        setProfile(p)
      }
      setStreak(s?.current_streak || 0)
    }
    load()
  }, [pathname])

  useEffect(() => {
    setShowMenu(false)
    setShowLang(false)
  }, [pathname])

  async function saveLang(lang: string) {
    setShowLang(false)
    if (!profile) return
    localStorage.setItem('pratium_lang', lang)
    setProfile((prev: any) => prev ? { ...prev, language: lang } : prev)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ language: lang }).eq('id', user.id)
  }

  async function handleSignOut() {
    setShowMenu(false)
    localStorage.removeItem('pratium_lang')
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!profile) return null
  const HIDDEN = ['/login', '/register', '/profile', '/']
  if (HIDDEN.includes(pathname)) return null

  const testsLeft = profile.plan === 'free' ? 10 - (profile.monthly_test_count || 0) : null
  const activeLang = LANGS.find(l => l.code === profile.language) || LANGS[0]

  return (
    <>
      {/* Floating navbar boşluğu */}
      <div style={{ height: '100px' }} />

      {/* ── DESKTOP NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 48px)', maxWidth: '1100px', zIndex: 1000,
      }} className="desktop-only">
        <div style={{
          background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
          borderRadius: '999px', boxShadow: '0 8px 40px rgba(15,23,42,0.12)',
          border: '1px solid #e8eef4', height: '68px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px 0 16px', gap: '8px',
        }}>

          {/* Logo */}
          <Link href="/quiz" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '40px', width: 'auto' }} />
          </Link>

          {/* Orta nav linkleri */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {[
              { href: '/quiz', label: '⚡ Test' },
              { href: '/daily', label: streak > 0 ? `🔥 ${streak}` : '📅 Günlük' },
              { href: '/leaderboard', label: '🏆 Sıralama' },
              { href: '/analysis', label: '📊 Analiz' },
              { href: '/archive', label: '🗂️ Arşiv' },
            ].map(item => (
              <Link key={item.href} href={item.href} style={{
                padding: '7px 14px', borderRadius: '999px', fontSize: '13px',
                fontWeight: 500, color: pathname === item.href ? '#1ECFB8' : '#3B566E',
                background: pathname === item.href ? 'rgba(30,207,184,0.1)' : 'transparent',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
                onMouseEnter={e => { if (pathname !== item.href) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (pathname !== item.href) e.currentTarget.style.background = 'transparent' }}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Sağ taraf */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

            {/* Test hakkı */}
            {testsLeft !== null && (
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <span style={{
                  fontSize: '12px', padding: '5px 12px', borderRadius: '999px',
                  background: testsLeft <= 2 ? 'rgba(220,38,38,0.08)' : 'rgba(30,207,184,0.08)',
                  color: testsLeft <= 2 ? '#dc2626' : '#0F172A',
                  border: `1px solid ${testsLeft <= 2 ? 'rgba(220,38,38,0.2)' : 'rgba(30,207,184,0.2)'}`,
                  fontWeight: 500, whiteSpace: 'nowrap',
                }}>
                  {testsLeft} test kaldı
                </span>
              </Link>
            )}

            {profile.plan === 'premium' && (
              <Link href="/pricing" style={{ textDecoration: 'none' }}>
                <span style={{
                  fontSize: '12px', padding: '5px 12px', borderRadius: '999px',
                  background: 'linear-gradient(135deg, #5B7FEE, #1ECFB8)',
                  color: '#fff', fontWeight: 600,
                }}>★ Premium</span>
              </Link>
            )}

            {/* Dil seçici */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowLang(v => !v); setShowMenu(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '7px 12px', borderRadius: '999px', cursor: 'pointer',
                  border: '1.5px solid #e8eef4', background: '#f8fafc',
                  color: '#3B566E', fontSize: '13px', fontWeight: 500,
                }}
              >
                <span>{activeLang.flag}</span>
                <span style={{ fontSize: '10px', opacity: 0.5 }}>▾</span>
              </button>
              {showLang && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowLang(false)} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 99,
                    background: '#fff', border: '1px solid #e8eef4',
                    borderRadius: '16px', padding: '6px', minWidth: '160px',
                    boxShadow: '0 8px 40px rgba(15,23,42,0.12)',
                  }}>
                    {LANGS.map(l => (
                      <button key={l.code} onClick={() => saveLang(l.code)} style={{
                        display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                        padding: '8px 12px', borderRadius: '10px', border: 'none',
                        background: profile.language === l.code ? 'rgba(30,207,184,0.08)' : 'transparent',
                        color: profile.language === l.code ? '#1ECFB8' : '#3B566E',
                        fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                        fontWeight: profile.language === l.code ? 600 : 400,
                      }}>
                        {l.flag} {l.code}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Avatar / Dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowMenu(v => !v); setShowLang(false) }}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #5B7FEE, #1ECFB8)',
                  border: 'none', color: '#fff', fontWeight: 700, fontSize: '13px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexShrink: 0, fontFamily: 'inherit',
                  boxShadow: '0 4px 12px rgba(30,207,184,0.3)',
                }}
              >
                {profile.name?.slice(0, 2).toUpperCase()}
              </button>

              {showMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 99,
                    background: '#fff', border: '1px solid #e8eef4',
                    borderRadius: '20px', padding: '8px', minWidth: '220px',
                    boxShadow: '0 8px 40px rgba(15,23,42,0.12)',
                  }}>
                    {/* Profil özeti */}
                    <div style={{
                      padding: '10px 14px 10px', marginBottom: '6px',
                      borderBottom: '1px solid #f0f4f8',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: '#0F172A' }}>{profile.name}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>
                        {profile.plan === 'premium'
                          ? <span style={{ color: '#1ECFB8', fontWeight: 600 }}>★ Premium</span>
                          : 'Ücretsiz'}
                        {streak > 0 && <span style={{ marginLeft: '8px' }}>🔥 {streak} gün</span>}
                      </div>
                      {testsLeft !== null && (
                        <div style={{ fontSize: '11px', color: testsLeft <= 2 ? '#dc2626' : '#94a3b8', marginTop: '2px' }}>
                          Bu ay {testsLeft} test hakkı kaldı
                        </div>
                      )}
                    </div>

                    {/* Menü linkleri */}
                    {MENU_ITEMS.map(item => (
                      <Link key={item.href} href={item.href} onClick={() => setShowMenu(false)} style={{
                        display: 'block', padding: '8px 14px', borderRadius: '10px',
                        fontSize: '13px', color: pathname === item.href ? '#1ECFB8' : '#3B566E',
                        background: pathname === item.href ? 'rgba(30,207,184,0.08)' : 'transparent',
                        fontWeight: pathname === item.href ? 600 : 400,
                        transition: 'all 0.1s',
                      }}
                        onMouseEnter={e => { if (pathname !== item.href) e.currentTarget.style.background = '#f8fafc' }}
                        onMouseLeave={e => { if (pathname !== item.href) e.currentTarget.style.background = 'transparent' }}
                      >
                        {item.label}
                      </Link>
                    ))}

                    {/* Çıkış */}
                    <div style={{ borderTop: '1px solid #f0f4f8', marginTop: '6px', paddingTop: '6px' }}>
                      <button onClick={handleSignOut} style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 14px', borderRadius: '10px', fontSize: '13px',
                        color: '#dc2626', background: 'none', border: 'none',
                        cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
                        transition: 'background 0.1s',
                      }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        Çıkış yap
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── MOBILE BOTTOM NAV ── */}
      <div className="mobile-only" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)',
        borderTop: '1px solid #e8eef4',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
        boxShadow: '0 -4px 20px rgba(15,23,42,0.08)',
      }}>
        {[
          { href: '/quiz', label: 'Test', icon: '⚡' },
          { href: '/daily', label: streak > 0 ? `${streak} gün` : 'Günlük', icon: streak > 0 ? '🔥' : '📅' },
          { href: '/leaderboard', label: 'Sıralama', icon: '🏆' },
          { href: '/analysis', label: 'Analiz', icon: '📊' },
          { href: '/archive', label: 'Arşiv', icon: '🗂️' },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            textDecoration: 'none', padding: '6px 10px', borderRadius: '12px', minWidth: '56px',
            background: pathname === item.href ? 'rgba(30,207,184,0.1)' : 'transparent',
            transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: '20px', lineHeight: 1 }}>{item.icon}</span>
            <span style={{
              fontSize: '10px', fontWeight: pathname === item.href ? 700 : 400,
              color: pathname === item.href ? '#1ECFB8' : '#94a3b8',
            }}>
              {item.label}
            </span>
          </Link>
        ))}
      </div>

      <style>{`
        .desktop-only { display: flex !important; }
        .mobile-only  { display: none !important; }
        @media (max-width: 768px) {
          .desktop-only { display: none !important; }
          .mobile-only  { display: flex !important; }
        }
      `}</style>
    </>
  )
}
