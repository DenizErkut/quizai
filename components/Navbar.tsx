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

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [streak, setStreak] = useState(0)
  const [showLang, setShowLang] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showMobileNav, setShowMobileNav] = useState(false)
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

  // Pathname değişince menüleri kapat
  useEffect(() => {
    setShowMenu(false)
    setShowLang(false)
    setShowMobileNav(false)
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
    setShowMenu(false); setShowMobileNav(false)
    localStorage.removeItem('pratium_lang')
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!profile) return null
  const HIDDEN = ['/login', '/register', '/profile', '/']
  if (HIDDEN.includes(pathname)) return null

  const testsLeft = profile.plan === 'free' ? 10 - (profile.monthly_test_count || 0) : null
  const activeLang = LANGS.find(l => l.code === profile.language) || LANGS[0]

  const NAV_ITEMS = [
    { href: '/daily', label: streak > 0 ? `🔥 ${streak}` : '📅 Günlük', color: '#FF6B6B', bg: '#FFE9E9' },
    { href: '/leaderboard', label: '🏆 Sıralama', color: '#D97706', bg: '#FFF8E1' },
    { href: '/analysis', label: '📊 Analiz', color: '#5B4CF5', bg: '#EDE9FF' },
    { href: '/plan', label: '📋 Plan', color: '#16A34A', bg: '#E8FFF0' },
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
    { label: '💎 Planlar', href: '/pricing' },
    { label: '🎁 Davet et & kazan', href: '/referral' },
    { label: '🔑 Şifremi değiştir', href: '/auth/reset-password' },
  ]

  return (
    <>
      <div style={{ height: '72px' }} />
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '72px',
        background: 'rgba(15,10,30,0.97)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 2px 20px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.25rem', zIndex: 1000,
      }}>
        {/* Logo + Slogan */}
        <Link href="/quiz" style={{ textDecoration: 'none', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '72px', width: 'auto' }} />
          <span className="desktop-only" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', fontWeight: 500, lineHeight: 1.4 }}>
            Pratik yap,<br />netlerini artır.
          </span>
        </Link>

        {/* Sağ taraf */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>

          {/* Test hakkı — sadece desktop */}
          {testsLeft !== null && (
            <Link href="/pricing" style={{ textDecoration: 'none' }} className="desktop-only">
              <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '99px', background: testsLeft <= 2 ? 'rgba(255,107,107,0.15)' : 'rgba(255,255,255,0.08)', color: testsLeft <= 2 ? '#FF6B6B' : 'rgba(255,255,255,0.6)', border: `1px solid ${testsLeft <= 2 ? 'rgba(255,107,107,0.3)' : 'rgba(255,255,255,0.1)'}`, whiteSpace: 'nowrap' }}>
                {testsLeft} test kaldı
              </span>
            </Link>
          )}

          {profile.plan === 'premium' && (
            <Link href="/pricing" style={{ textDecoration: 'none' }} className="desktop-only">
              <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '99px', background: 'rgba(255,107,107,0.15)', color: '#FF6B6B', border: '1px solid rgba(255,107,107,0.3)', fontWeight: 600 }}>★ Premium</span>
            </Link>
          )}

          {/* Dil seçici */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowLang(v => !v); setShowMenu(false); setShowMobileNav(false) }}
              style={{ gap: '4px', fontSize: '13px', padding: '5px 8px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.8)' }}>
              <span>{activeLang.flag}</span>
              <span style={{ fontSize: '10px', opacity: 0.5 }}>▾</span>
            </button>
            {showLang && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowLang(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 99, background: '#1A0F3C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '6px', minWidth: '150px', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                  {LANGS.map(l => (
                    <button key={l.code} onClick={() => saveLang(l.code)}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 10px', borderRadius: '8px', border: 'none', fontFamily: 'var(--font-sans)', background: profile.language === l.code ? 'rgba(255,107,107,0.15)' : 'transparent', color: profile.language === l.code ? '#FF6B6B' : 'rgba(255,255,255,0.7)', fontSize: '13px', cursor: 'pointer', fontWeight: profile.language === l.code ? 600 : 400 }}>
                      {l.flag} {l.code}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Avatar menü */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowMenu(v => !v); setShowLang(false); setShowMobileNav(false) }}
              style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #FF6B6B, #EC4899)', border: 'none', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {profile.name?.slice(0, 2).toUpperCase()}
            </button>
            {showMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 99, background: '#1A0F3C', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '6px', minWidth: '210px', boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }}>
                  <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#fff' }}>{profile.name}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
                      {profile.plan === 'premium' ? '★ Premium' : 'Ücretsiz'}
                      {streak > 0 && ` · 🔥 ${streak} gün`}
                    </div>
                    {testsLeft !== null && (
                      <div style={{ fontSize: '11px', color: testsLeft <= 2 ? 'var(--red)' : 'var(--text3)', marginTop: '2px' }}>
                        Bu ay {testsLeft} test hakkı kaldı
                      </div>
                    )}
                  </div>
                  {MENU_ITEMS.map(item => (
                    <Link key={item.href} href={item.href} onClick={() => setShowMenu(false)}
                      style={{ display: 'block', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', color: 'rgba(255,255,255,0.8)', textDecoration: 'none', background: pathname === item.href ? 'rgba(255,107,107,0.15)' : 'transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = pathname === item.href ? 'rgba(255,107,107,0.15)' : 'transparent')}>
                      {item.label}
                    </Link>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '6px', paddingTop: '6px' }}>
                    <button onClick={handleSignOut}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', color: '#FF6B6B', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,107,107,0.12)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      Çıkış yap
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <div className="mobile-bottom-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
        background: 'rgba(15,10,30,0.97)', backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
      }}>
        {[
          { href: '/quiz', label: 'Test', icon: '⚡' },
          { href: '/daily', label: streak > 0 ? `${streak} gün` : 'Günlük', icon: streak > 0 ? '🔥' : '📅' },
          { href: '/leaderboard', label: 'Sıralama', icon: '🏆' },
          { href: '/analysis', label: 'Analiz', icon: '📊' },
          { href: '/plan', label: 'Plan', icon: '📋' },
        ].map(item => (
          <Link key={item.href} href={item.href}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', textDecoration: 'none', padding: '4px 8px', borderRadius: '8px', minWidth: '52px', background: pathname === item.href ? 'rgba(255,107,107,0.15)' : 'transparent' }}>
            <span style={{ fontSize: '20px', lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: '10px', color: pathname === item.href ? '#FF6B6B' : 'rgba(255,255,255,0.4)', fontWeight: pathname === item.href ? 600 : 400 }}>
              {item.label}
            </span>
          </Link>
        ))}
      </div>

      <style>{`
        .desktop-nav { display: flex; }
        .desktop-only { display: inline-block; }
        .mobile-bottom-nav { display: none; }

        @media (max-width: 768px) {
          .desktop-nav { display: none !important; }
          .desktop-only { display: none !important; }
          .mobile-bottom-nav { display: flex !important; }
          main { padding-bottom: 70px !important; }
        }
      `}</style>
    </>
  )
}
