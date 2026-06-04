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

// Desktop avatar dropdown menüsü
const DROPDOWN_ITEMS = [
  { label: '📈 Analiz',          href: '/analysis' },
  { label: '🗂️ Soru Arşivi',     href: '/archive' },
  { label: '🛠️ PDF Araçları',    href: '/pdf-tools' },
  { label: '🏫 Sınıflarım',      href: '/classes' },
  { label: '📝 Ödevlerim',       href: '/assignments' },
  { label: '📋 Gelişim Planı',   href: '/plan' },
  { label: '📝 Notlarım',        href: '/notes' },
  { label: '🎁 Davet et & kazan', href: '/referral' },
  { label: '💎 Planlar',         href: '/pricing' },
  { label: '✏️ Profil Düzenle',  href: '/profile/edit' },
  { label: '🔑 Şifremi Değiştir', href: '/auth/reset-password' },
]

// Tüm menü (mobile için — mevcut haliyle kalıyor)
const MENU_ITEMS = [
  { label: '⚡ Yeni test',        href: '/quiz' },
  { label: '📅 Günlük test',      href: '/daily' },
  { label: '📊 Dashboard',        href: '/dashboard' },
  { label: '📈 Analiz',           href: '/analysis' },
  { label: '📋 Gelişim planı',    href: '/plan' },
  { label: '🏆 Sıralama',         href: '/leaderboard' },
  { label: '🏫 Sınıflarım',       href: '/classes' },
  { label: '✏️ Profil düzenle',   href: '/profile/edit' },
  { label: '📝 Notlarım',         href: '/notes' },
  { label: '🗂️ Soru arşivi',      href: '/archive' },
  { label: '🛠️ PDF Araçları',     href: '/pdf-tools' },
  { label: '📝 Ödevlerim',        href: '/assignments' },
  { label: '💎 Planlar',          href: '/pricing' },
  { label: '🎁 Davet et & kazan', href: '/referral' },
  { label: '🎓 Öğretmen paneli',  href: '/teacher' },
  { label: '👨‍👩‍👧 Veli paneli',     href: '/parent' },
  { label: '🔑 Şifremi değiştir', href: '/auth/reset-password' },
]

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<any>(null)
  const [streak, setStreak] = useState(0)
  const [showLang, setShowLang] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isDark, setIsDark] = useState(false)
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('name,plan,monthly_test_count,language,referral_code,avatar_url,role').eq('id', user.id).maybeSingle(),
        supabase.from('streaks').select('current_streak').eq('user_id', user.id).maybeSingle(),
      ])
      if (p) {
        const stored = localStorage.getItem('pratium_lang')
        if (stored) p.language = stored
        if (p.role === 'teacher') {
          const { data: tData } = await supabase.from('teachers').select('approved').eq('user_id', user.id).maybeSingle()
          p.teacher_approved = tData?.approved || false
        }
        setProfile(p)
      }
      setStreak(s?.current_streak || 0)

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)
      setUnreadCount(count || 0)
    }
    load()
  }, [pathname])

  useEffect(() => { setShowMenu(false); setShowLang(false) }, [pathname])

  useEffect(() => {
    const stored = localStorage.getItem('pratium-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = stored === 'dark' || (!stored && prefersDark)
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [])

  function toggleDark() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('pratium-theme', next ? 'dark' : 'light')
  }

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
  if (pathname?.startsWith('/institution')) return null
  if (pathname?.startsWith('/teacher')) return null
  if (pathname?.startsWith('/parent')) return null
  const HIDDEN = ['/login', '/register', '/profile', '/']
  if (HIDDEN.includes(pathname)) return null

  const testsLeft = profile.plan === 'free' ? 10 - (profile.monthly_test_count || 0) : null
  const activeLang = LANGS.find(l => l.code === profile.language) || LANGS[0]

  const isApprovedTeacher = profile?.role === 'teacher' && profile?.teacher_approved
  const isParent = profile?.role === 'parent'
  const isInstitution = profile?.role === 'institution_admin'

  // ── Desktop ana linkler (sadeleştirildi) ──
  const NAV_LINKS = isInstitution ? [
    { href: '/institution', label: '🏛️ Kurum Paneli' },
  ] : isApprovedTeacher ? [
    { href: '/teacher',             label: '🏫 Panel' },
    { href: '/teacher/assign',      label: '📝 Ödev Ata' },
    { href: '/teacher/performance', label: '📊 Performans' },
    { href: '/teacher/notify',      label: '🔔 Bildirim' },
  ] : isParent ? [
    { href: '/parent', label: '👨‍👩‍👧 Veli Paneli' },
  ] : [
    { href: '/quiz',        label: '⚡ Test' },
    { href: '/daily',       label: streak > 0 ? `🔥 ${streak} gün` : '📅 Günlük' },
    { href: '/leaderboard', label: '🏆 Sıralama' },
  ]

  // Premium rozet tipi
  const planBadge =
    profile.plan === 'unlimited' ? { emoji: '⭐', color: '#0d9488', title: 'Unlimited' } :
    profile.plan === 'premium'   ? { emoji: '★',  color: '#fdd31d', title: 'Premium' } :
    null

  return (
    <>
      <style>{`
        .nav-spacer { height: 90px; }
        @media (max-width: 768px) { .nav-spacer { height: 58px; } }
      `}</style>
      <div className="nav-spacer" />

      {/* ── MOBILE TOP BAR ── */}
      <div className="mobile-only" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '58px',
        background: '#082465', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px',
        boxShadow: '0 2px 12px rgba(8,36,101,0.3)',
      }}>
        <Link href="/quiz" style={{ flexShrink: 0 }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '28px', filter: 'brightness(0) invert(1)' }} />
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={toggleDark}
            title={isDark ? 'Aydınlık mod' : 'Karanlık mod'}
            style={{ width: 38, height: 38, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', flexShrink: 0, transition: 'all 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
            {isDark ? '☀️' : '🌙'}
          </button>

          <a href="/notifications" onClick={() => setUnreadCount(0)} style={{
            position: 'relative', width: 34, height: 34, borderRadius: '8px',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: '17px' }}>🔔</span>
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                width: 17, height: 17, borderRadius: '50%',
                background: '#fdd31d', color: '#082465',
                fontSize: '9px', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #082465',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </a>

          {/* Dil seçici */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowLang(v => !v); setShowMenu(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '7px 9px', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: '13px', fontFamily: 'inherit' }}>
              <span>{activeLang.flag}</span>
              <span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
            </button>
            {showLang && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowLang(false)} />
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 99, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '6px', minWidth: '155px', boxShadow: '0 8px 32px rgba(8,36,101,0.2)' }}>
                  {LANGS.map(l => (
                    <button key={l.code} onClick={() => saveLang(l.code)} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', borderRadius: '8px', border: 'none', background: profile.language === l.code ? 'rgba(30,207,184,0.08)' : 'transparent', color: profile.language === l.code ? '#0a9e90' : '#3B566E', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: profile.language === l.code ? 600 : 400 }}>
                      {l.flag} {l.code}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Avatar */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowMenu(v => !v); setShowLang(false) }}
              style={{
                width: 40, height: 40, borderRadius: '50%',
                background: profile.avatar_url ? 'transparent' : '#fdd31d',
                border: profile.avatar_url ? '2.5px solid #fdd31d' : 'none',
                color: '#082465', fontWeight: 800, fontSize: '13px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'inherit', overflow: 'hidden', padding: 0,
                boxShadow: profile.avatar_url ? '0 2px 10px rgba(8,36,101,0.25)' : '0 2px 8px rgba(253,211,29,0.4)',
                transition: 'box-shadow 0.2s, transform 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}>
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              ) : (
                <span style={{ fontSize: '13px', fontWeight: 800 }}>{profile.name?.slice(0, 2).toUpperCase()}</span>
              )}
            </button>

            {showMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
                <div style={{ position: 'fixed', top: '64px', right: '12px', zIndex: 9999, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '8px', minWidth: '220px', boxShadow: '0 8px 40px rgba(8,36,101,0.25)', maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
                  <div style={{ padding: '10px 14px', marginBottom: '6px', borderBottom: '1px solid #f0f4f8' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#082465' }}>{profile.name}</div>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                      {profile.plan === 'premium'
                        ? <span style={{ color: '#0a9e90', fontWeight: 600 }}>★ Premium</span>
                        : 'Ücretsiz'}
                      {streak > 0 && <span style={{ marginLeft: '6px' }}>🔥 {streak} gün</span>}
                    </div>
                    {testsLeft !== null && (
                      <div style={{ fontSize: '11px', color: testsLeft <= 2 ? '#dc2626' : '#94a3b8', marginTop: '2px' }}>
                        Bu ay {testsLeft} test hakkı kaldı
                      </div>
                    )}
                  </div>
                  {MENU_ITEMS.map(item => (
                    <Link key={item.href} href={item.href} onClick={() => setShowMenu(false)} style={{
                      display: 'block', padding: '8px 14px', borderRadius: '10px',
                      fontSize: '13px', color: pathname === item.href ? '#0a9e90' : '#3B566E',
                      background: pathname === item.href ? 'rgba(30,207,184,0.08)' : 'transparent',
                      fontWeight: pathname === item.href ? 600 : 400,
                    }}>
                      {item.label}
                    </Link>
                  ))}
                  <div style={{ borderTop: '1px solid #f0f4f8', marginTop: '6px', paddingTop: '6px' }}>
                    <button onClick={handleSignOut} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', borderRadius: '10px', fontSize: '13px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}>
                      Çıkış yap
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── DESKTOP NAV ── */}
      <nav className="desktop-only" style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '90px',
        background: '#082465',
        boxShadow: '0 2px 16px rgba(8,36,101,0.3)',
        display: 'flex', alignItems: 'center', zIndex: 1000,
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '0 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>

          {/* Logo */}
          <Link href="/quiz" style={{ flexShrink: 0 }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '76px', width: 'auto', filter: 'brightness(0) invert(1)' }} />
          </Link>

          {/* Ana nav linkleri — sadece Test | Günlük | Sıralama */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            {NAV_LINKS.map(item => (
              <Link key={item.href} href={item.href} style={{
                padding: '8px 18px', borderRadius: '8px', fontSize: '15px',
                fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.15s',
                color: pathname === item.href ? '#fdd31d' : 'rgba(255,255,255,0.7)',
                background: pathname === item.href ? 'rgba(253,211,29,0.1)' : 'transparent',
                borderBottom: pathname === item.href ? '2px solid #fdd31d' : '2px solid transparent',
              }}
                onMouseEnter={e => { if (pathname !== item.href) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)' } }}
                onMouseLeave={e => { if (pathname !== item.href) { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; e.currentTarget.style.background = 'transparent' } }}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Sağ taraf */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>

            {/* Dark mode toggle */}
            <button onClick={toggleDark}
              title={isDark ? 'Aydınlık mod' : 'Karanlık mod'}
              style={{ width: 38, height: 38, borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '16px', flexShrink: 0, transition: 'all 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}>
              {isDark ? '☀️' : '🌙'}
            </button>

            {/* Bildirim çanı */}
            <a href="/notifications" onClick={() => setUnreadCount(0)} style={{
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: '8px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', textDecoration: 'none', transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}>
              <span style={{ fontSize: '18px', lineHeight: 1 }}>🔔</span>
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#fdd31d', color: '#082465',
                  fontSize: '10px', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #082465',
                }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </a>

            {/* Dil seçici */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => { setShowLang(v => !v); setShowMenu(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '7px 10px', borderRadius: '8px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.8)', fontSize: '13px', fontFamily: 'inherit' }}>
                <span>{activeLang.flag}</span>
                <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
              </button>
              {showLang && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowLang(false)} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 99, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '6px', minWidth: '160px', boxShadow: '0 8px 40px rgba(8,36,101,0.15)' }}>
                    {LANGS.map(l => (
                      <button key={l.code} onClick={() => saveLang(l.code)} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', borderRadius: '8px', border: 'none', background: profile.language === l.code ? 'rgba(30,207,184,0.08)' : 'transparent', color: profile.language === l.code ? '#0a9e90' : '#3B566E', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: profile.language === l.code ? 600 : 400 }}>
                        {l.flag} {l.code}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Avatar + Premium badge + Dropdown */}
            <div style={{ position: 'relative' }}>
              {/* Premium / Unlimited küçük rozet */}
              {planBadge && (
                <span title={planBadge.title} style={{
                  position: 'absolute', top: -6, right: -4,
                  width: 18, height: 18, borderRadius: '50%',
                  background: planBadge.color,
                  color: planBadge.color === '#fdd31d' ? '#082465' : '#fff',
                  fontSize: '9px', fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid #082465',
                  zIndex: 2, lineHeight: 1,
                }}>
                  {planBadge.emoji}
                </span>
              )}

              <button onClick={() => { setShowMenu(v => !v); setShowLang(false) }}
                style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: profile.avatar_url ? 'transparent' : '#fdd31d',
                  border: profile.avatar_url ? '2.5px solid #fdd31d' : 'none',
                  color: '#082465', fontWeight: 800, fontSize: '13px',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, fontFamily: 'inherit', overflow: 'hidden', padding: 0,
                  boxShadow: profile.avatar_url ? '0 2px 8px rgba(8,36,101,0.2)' : 'none',
                  transition: 'transform 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.05)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}>
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  profile.name?.slice(0, 2).toUpperCase()
                )}
              </button>

              {showMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
                  <div style={{
                    position: 'fixed', top: '58px', right: '8px', zIndex: 9999,
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '18px',
                    padding: '8px', minWidth: '230px',
                    boxShadow: '0 8px 40px rgba(8,36,101,0.2)',
                    maxHeight: 'calc(100vh - 74px)', overflowY: 'auto',
                  }}>
                    {/* Profil özeti */}
                    <div style={{ padding: '12px 14px', marginBottom: '6px', borderBottom: '1px solid #f0f4f8' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {/* Mini avatar */}
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: profile.avatar_url ? 'transparent' : '#fdd31d',
                          border: profile.avatar_url ? '2px solid #fdd31d' : 'none',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          overflow: 'hidden', fontSize: '12px', fontWeight: 800, color: '#082465',
                        }}>
                          {profile.avatar_url
                            ? <img src={profile.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : profile.name?.slice(0, 2).toUpperCase()
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '14px', color: '#082465', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            {planBadge
                              ? <span style={{ color: planBadge.color === '#fdd31d' ? '#b8860b' : planBadge.color, fontWeight: 600 }}>{planBadge.emoji} {planBadge.title}</span>
                              : <span>Ücretsiz</span>
                            }
                            {streak > 0 && <span>🔥 {streak} gün</span>}
                          </div>
                          {testsLeft !== null && (
                            <div style={{ fontSize: '11px', color: testsLeft <= 2 ? '#dc2626' : '#94a3b8', marginTop: '2px' }}>
                              Bu ay {testsLeft} test hakkı kaldı
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Dropdown menü öğeleri */}
                    {[
                      ...DROPDOWN_ITEMS,
                      ...(isApprovedTeacher ? [{ label: '🎓 Öğretmen Paneli', href: '/teacher' }] : []),
                      ...(isParent          ? [{ label: '👨‍👩‍👧 Veli Paneli',      href: '/parent'  }] : []),
                    ].map(item => (
                      <Link key={item.href} href={item.href} onClick={() => setShowMenu(false)} style={{
                        display: 'block', padding: '8px 14px', borderRadius: '10px',
                        fontSize: '13px', color: pathname === item.href ? '#0a9e90' : '#3B566E',
                        background: pathname === item.href ? 'rgba(30,207,184,0.08)' : 'transparent',
                        fontWeight: pathname === item.href ? 600 : 400, transition: 'all 0.1s',
                        textDecoration: 'none',
                      }}
                        onMouseEnter={e => { if (pathname !== item.href) e.currentTarget.style.background = '#f8fafc' }}
                        onMouseLeave={e => { if (pathname !== item.href) e.currentTarget.style.background = 'transparent' }}
                      >
                        {item.label}
                      </Link>
                    ))}

                    <div style={{ borderTop: '1px solid #f0f4f8', marginTop: '6px', paddingTop: '6px' }}>
                      <button onClick={handleSignOut} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', borderRadius: '10px', fontSize: '13px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        🚪 Çıkış yap
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
        background: '#082465',
        borderTop: '1px solid rgba(253,211,29,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
      }}>
        {[
          { href: '/quiz',      label: 'Test',    icon: '⚡' },
          { href: '/daily',     label: streak > 0 ? `${streak} gün` : 'Günlük', icon: streak > 0 ? '🔥' : '📅' },
          { href: '/analysis',  label: 'Analiz',  icon: '📊' },
          { href: '/archive',   label: 'Arşiv',   icon: '🗂️' },
          { href: '/pdf-tools', label: 'PDF',     icon: '🛠️' },
        ].map(item => (
          <Link key={item.href} href={item.href} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            textDecoration: 'none', padding: '6px 8px', borderRadius: '10px', minWidth: '52px', flex: 1,
            background: pathname === item.href ? 'rgba(253,211,29,0.12)' : 'transparent',
          }}>
            <span style={{ fontSize: '20px', lineHeight: 1 }}>{item.icon}</span>
            <span style={{ fontSize: '10px', fontWeight: pathname === item.href ? 700 : 400, color: pathname === item.href ? '#fdd31d' : 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap' }}>
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
