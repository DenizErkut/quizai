'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveName } from '@/lib/identity/resolve-client'

interface Profile { name: string; grade: string; plan: string }

const CHOICES = [
  {
    href: '/quiz',
    icon: '⚡',
    title: 'Anlık Test',
    desc: 'Kişiselleştirilmiş sorularla hemen pratik yap',
    color: '#F5A623',
    bg: 'linear-gradient(135deg, #F5A623 0%, #F57C00 100%)',
  },
  {
    href: '/exam',
    icon: '🎯',
    title: 'Sınav Simülasyonu',
    desc: 'Gerçek sınav formatında, zamanlı deneme çöz',
    color: '#2196C9',
    bg: 'linear-gradient(135deg, #2CB5E8 0%, #1B6FA8 100%)',
  },
  {
    href: '/quiz?type=short_answer',
    icon: '✍️',
    title: 'Açık Uçlu Sorular',
    desc: 'Şıksız, kendi cümlelerinle yazarak cevapla',
    color: '#4CA84C',
    bg: 'linear-gradient(135deg, #6BC96B 0%, #3E8E3E 100%)',
  },
  {
    href: '/reading',
    icon: '🎧',
    title: 'Sesli Kitap',
    desc: 'Dinle, anla, anlama sorularını çöz',
    color: '#F5C518',
    bg: 'linear-gradient(135deg, #FFD84D 0%, #F0AC00 100%)',
  },
]

export default function HomeChoicePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [greeting, setGreeting] = useState('Merhaba')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const h = new Date().getHours()
    if (h < 12) setGreeting('Günaydın')
    else if (h < 18) setGreeting('İyi günler')
    else setGreeting('İyi akşamlar')

    async function load() {
      const supabase = createClient() as any
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: p }, displayName] = await Promise.all([
        supabase.from('profiles').select('grade, plan').eq('id', user.id).single(),
        resolveName(supabase, user.id),
      ])
      setProfile(p ? { ...p, name: displayName } : (displayName ? { name: displayName, grade: '', plan: 'free' } : null))
      setLoading(false)
    }
    load()
  }, [])

  const firstName = profile?.name?.split(' ')[0] || ''
  const initials = profile?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'U'

  if (loading) return (
    <main style={{ minHeight: '100vh', background: '#082465', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ borderTopColor: '#fdd31d', borderColor: 'rgba(253,211,29,0.2)' }} />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>

      {/* ── HERO HEADER (dashboard ile ayni Okulyo stili) ── */}
      <div style={{
        background: 'linear-gradient(135deg, #082465 0%, #0d3b8e 60%, #1ECFB8 100%)',
        padding: '2rem 1.5rem 3rem',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', bottom: -20, left: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(30,207,184,0.15)' }} />

        <div style={{ maxWidth: '520px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.75rem' }}>
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
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>{greeting} 👋</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff' }}>{firstName}</div>
            </div>
          </div>

          <div style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
            Bugün ne yapmak istersin?
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>
            Bir mod seç, hemen başlayalım
          </div>
        </div>
      </div>

      {/* ── SEÇİM KARTLARI ── */}
      <div style={{ maxWidth: '520px', margin: '-1.5rem auto 0', padding: '0 1.25rem', position: 'relative', zIndex: 2 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          {CHOICES.map(c => (
            <Link key={c.href} href={c.href} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', textDecoration: 'none',
              padding: '1.75rem 1rem', borderRadius: '20px',
              background: c.bg,
              boxShadow: `0 8px 24px ${c.color}55`,
              minHeight: '150px',
              transition: 'transform 0.15s ease',
            }}
              className="home-choice-card"
            >
              <div style={{ fontSize: '32px', marginBottom: '10px' }}>{c.icon}</div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', marginBottom: '4px', lineHeight: 1.25 }}>
                {c.title}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>
                {c.desc}
              </div>
            </Link>
          ))}
        </div>

        {/* Diğer araçlara erişim */}
        <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
          <Link href="/dashboard" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none' }}>
            Tüm araçları gör (Analiz, Arşiv, Sıralama...) →
          </Link>
        </div>
      </div>

      <style>{`
        .home-choice-card:active { transform: scale(0.96); }
        @media (hover: hover) {
          .home-choice-card:hover { transform: translateY(-3px); }
        }
      `}</style>
    </main>
  )
}
