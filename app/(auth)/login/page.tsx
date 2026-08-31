'use client'
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const ROLES = [
  {
    key: 'student',
    icon: '🎒',
    title: 'Öğrenci Girişi',
    desc: 'Test çöz, gelişimini takip et, sıralamada yüksel',
    color: '#29483d',
    bg: '#e5f0eb',
    border: '#c6ddd3',
    href: '/login/student',
  },
  {
    key: 'parent',
    icon: '👨‍👩‍👧',
    title: 'Veli Girişi',
    desc: 'Çocuğunun performansını, streak ve ödev durumunu takip et',
    color: '#a14b36',
    bg: '#fae4da',
    border: '#efc8b8',
    href: '/login/parent',
  },
  {
    key: 'teacher',
    icon: '🎓',
    title: 'Öğretmen Girişi',
    desc: 'Sınıf yönetimi, ödev atama, öğrenci analizi ve raporlar',
    color: '#78531b',
    bg: '#fff0c8',
    border: '#eddaa3',
    href: '/login/teacher',
  },
  {
    key: 'institution',
    icon: '🏛️',
    title: 'Kurum Girişi',
    desc: 'Kurumunuza bağlı öğrencilerin genel durumunu izleyin',
    color: '#55506b',
    bg: '#eceaf3',
    border: '#d8d3e6',
    href: '/login/institution',
  },
]

function LoginSelectContent() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const withNext = (href: string) => next ? `${href}?next=${encodeURIComponent(next)}` : href
  return (
    <main className="auth-select-page">
      <div className="auth-select-shell">

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '72px', width: 'auto' }} />
          </Link>
          <div className="warm-badge" style={{ marginTop: '18px' }}>Tekrar hoş geldin</div>
          <h1>Nasıl devam etmek istersin?</h1>
          <p style={{ fontSize: '14px', color: 'var(--text3)', marginTop: '8px' }}>
            Sana uygun çalışma alanını seç.
          </p>
        </div>

        {/* Rol kartları */}
        <div className="auth-role-grid anim-up-1">
          {ROLES.map(role => (
            <Link key={role.key} href={withNext(role.href)}
              style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px', borderRadius: '16px', border: `1.5px solid ${role.border}`, background: role.bg, textDecoration: 'none', transition: 'all 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '' }}>
              <div style={{ width: 48, height: 48, borderRadius: '14px', background: role.bg, border: `1.5px solid ${role.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
                {role.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '15px', color: role.color, marginBottom: '2px' }}>{role.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.5 }}>{role.desc}</div>
              </div>
              <span style={{ color: role.color, fontSize: '18px', opacity: 0.6 }}>›</span>
            </Link>
          ))}
        </div>

        {/* Kayıt ol */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '13px', color: 'var(--text3)' }} className="anim-up-2">
          Hesabın yok mu?{' '}
          <Link href={next ? `/register?next=${encodeURIComponent(next)}` : '/register'} style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
            Kayıt ol
          </Link>
        </div>
      </div>
    </main>
  )
}

export default function LoginSelectPage() {
  return (
    <Suspense fallback={null}>
      <LoginSelectContent />
    </Suspense>
  )
}
