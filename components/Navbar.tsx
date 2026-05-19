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

interface NavProfile {
  name: string
  plan: string
  monthly_test_count: number
  language: string
  referral_code: string
}

export default function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const [profile, setProfile] = useState<NavProfile | null>(null)
  const [showLang, setShowLang] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('profiles')
        .select('name, plan, monthly_test_count, language, referral_code')
        .eq('id', user.id).single()
      if (data) {
        // localStorage'daki dil daha güncel olabilir
        const stored = localStorage.getItem('quizai_lang')
        if (stored) data.language = stored
        setProfile(data)
      }
    }
    load()
  }, [pathname])

  async function saveLang(lang: string) {
    setShowLang(false)
    if (!profile) return
    // Önce localStorage'a yaz — anında ve senkron
    localStorage.setItem('quizai_lang', lang)
    // State'i güncelle
    setProfile(prev => prev ? { ...prev, language: lang } : prev)
    // Supabase'e async yaz
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ language: lang }).eq('id', user.id)
  }

  async function handleSignOut() {
    localStorage.removeItem('quizai_lang')
    await supabase.auth.signOut()
    router.push('/')
  }

  if (!profile) return null

  const testsLeft = profile.plan === 'free' ? 10 - (profile.monthly_test_count || 0) : null
  const activeLang = LANGS.find(l => l.code === profile.language) || LANGS[0]

  if (pathname === '/login' || pathname === '/register' || pathname === '/profile') return null

  return (
    <>
      <div style={{ height: '56px' }} />
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: '56px',
        background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 1.5rem', zIndex: 1000,
      }}>
        <Link href="/quiz" className="serif" style={{ fontSize: '20px', textDecoration: 'none', color: 'var(--text)', flexShrink: 0 }}>
          Quiz<span style={{ color: 'var(--accent)' }}>AI</span>
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {testsLeft !== null && (
            <Link href="/pricing" style={{ textDecoration: 'none' }}>
              <span style={{
                fontSize: '12px', padding: '5px 10px', borderRadius: '99px',
                background: testsLeft <= 2 ? 'var(--red-bg)' : 'var(--bg2)',
                color: testsLeft <= 2 ? 'var(--red)' : 'var(--text2)',
                border: `1px solid ${testsLeft <= 2 ? 'rgba(220,38,38,0.2)' : 'var(--border)'}`,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {testsLeft} test kaldı
              </span>
            </Link>
          )}

          {profile.plan === 'premium' && (
            <Link href="/pricing" style={{ textDecoration: 'none' }}>
              <span style={{
                fontSize: '12px', padding: '5px 10px', borderRadius: '99px',
                background: 'var(--accent-bg)', color: 'var(--accent)',
                border: '1px solid rgba(91,76,245,0.2)', fontWeight: 600, cursor: 'pointer',
              }}>★ Premium</span>
            </Link>
          )}

          {/* Dil seçici */}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-sm"
              onClick={() => { setShowLang(v => !v); setShowMenu(false) }}
              style={{ gap: '5px', fontSize: '13px' }}>
              <span>{activeLang.flag}</span>
              <span>{activeLang.code}</span>
              <span style={{ fontSize: '10px', opacity: 0.5 }}>▾</span>
            </button>
            {showLang && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowLang(false)} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 99,
                  background: 'var(--bg)', border: '1.5px solid var(--border)',
                  borderRadius: '12px', padding: '6px', minWidth: '160px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
                }}>
                  {LANGS.map(l => (
                    <button key={l.code} onClick={() => saveLang(l.code)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        width: '100%', padding: '8px 10px', borderRadius: '8px',
                        border: 'none', fontFamily: 'var(--font-sans)',
                        background: profile.language === l.code ? 'var(--accent-bg)' : 'transparent',
                        color: profile.language === l.code ? 'var(--accent)' : 'var(--text)',
                        fontSize: '13px', cursor: 'pointer',
                        fontWeight: profile.language === l.code ? 600 : 400,
                      }}>
                      <span>{l.flag}</span> {l.code}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Profil menü */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => { setShowMenu(v => !v); setShowLang(false) }}
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'var(--accent-bg)', border: '1.5px solid var(--accent)',
                color: 'var(--accent)', fontWeight: 600, fontSize: '13px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {profile.name.slice(0, 2).toUpperCase()}
            </button>
            {showMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setShowMenu(false)} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 99,
                  background: 'var(--bg)', border: '1.5px solid var(--border)',
                  borderRadius: '12px', padding: '6px', minWidth: '200px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
                }}>
                  <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', marginBottom: '6px' }}>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{profile.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                      {profile.plan === 'premium' ? '★ Premium' : 'Ücretsiz plan'}
                    </div>
                  </div>
                  {[
                    { label: '⚡ Yeni test', href: '/quiz' },
                    { label: '📊 Dashboard', href: '/dashboard' },
                    { label: '✏️ Profil düzenle', href: '/profile/edit' },
                    { label: '💎 Planlar', href: '/pricing' },
                  ].map(item => (
                    <Link key={item.href} href={item.href} onClick={() => setShowMenu(false)}
                      style={{
                        display: 'block', padding: '8px 12px', borderRadius: '8px',
                        fontSize: '13px', color: 'var(--text)', textDecoration: 'none',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >{item.label}</Link>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: '6px', paddingTop: '6px' }}>
                    <button onClick={handleSignOut}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
                        color: 'var(--red)', background: 'none', border: 'none',
                        cursor: 'pointer', fontFamily: 'var(--font-sans)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--red-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >Çıkış yap</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  )
}
