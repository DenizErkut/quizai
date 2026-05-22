'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const features = [
  { icon: '⚡', title: 'Anlık soru üretimi', desc: 'Konunu yaz, 10 saniyede sınıfına özel sorular hazır.', color: '#5B4CF5', bg: '#EDE9FF' },
  { icon: '🎯', title: 'Sana özel zorluk', desc: 'AI sınıfını, yaşını ve geçmiş skorunu analiz eder.', color: '#EC4899', bg: '#FFE9F5' },
  { icon: '🌍', title: 'Çoklu dil', desc: 'Türkçe, İngilizce, Almanca ve daha fazlası.', color: '#16A34A', bg: '#E8FFF0' },
  { icon: '📊', title: 'İlerleme takibi', desc: 'Her testin skoru kaydedilir, zayıf konular analiz edilir.', color: '#D97706', bg: '#FFF8E1' },
]

const examples = [
  { grade: 'Üniversite 1. sınıf', topic: 'Uçağın kısımları', count: 10 },
  { grade: 'Ortaokul 6. sınıf', topic: 'Asal sayılar ve OBEB', count: 10 },
  { grade: 'Lise 11. sınıf', topic: 'Organik kimya', count: 15 },
  { grade: 'İlkokul 4. sınıf', topic: 'Çarpım tablosu', count: 5 },
]

export default function LandingPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const supabase = createClient() as any
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (user) {
        router.replace('/quiz')
      } else {
        setChecking(false)
      }
    })
  }, [])

  if (checking) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#faf9ff' }}>

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 2rem', borderBottom: '1.5px solid rgba(79,70,229,0.12)',
        position: 'sticky', top: 0, background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(16px)', zIndex: 100,
        boxShadow: '0 2px 20px rgba(91,76,245,0.06)',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
          <img src="/pratium-logo.png" alt="Pratium" style={{ height: '80px', width: 'auto' }} />
        </Link>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/login" className="btn btn-ghost btn-sm">Giriş yap</Link>
          <Link href="/register" className="btn btn-primary btn-sm">Ücretsiz başla</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '6rem 1.5rem 4rem', background: 'radial-gradient(ellipse at 20% 10%, rgba(99,102,241,0.12) 0%, transparent 60%), radial-gradient(ellipse at 80% 90%, rgba(167,139,250,0.10) 0%, transparent 60%)' }}>
        <div className="badge badge-purple anim-up" style={{ marginBottom: '1.5rem' }}>
          AI destekli soru bankası
        </div>
        <h1 className="serif anim-up-1" style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.15,
          marginBottom: '1.25rem', maxWidth: '800px', margin: '0 auto 1.25rem',
        }}>
          Pratik yap,<br />
          <span style={{ color: '#4F46E5', fontStyle: 'italic' }}>başarıya ulaş.</span>
        </h1>
        <p className="anim-up-2" style={{
          color: 'var(--text2)', fontSize: '17px', maxWidth: '520px',
          margin: '0 auto 2.5rem', lineHeight: 1.7,
        }}>
          Konunu yaz, sınıfını seç — Yapay Zeka saniyeler içinde sana özel
          çoktan seçmeli sorular üretsin.
        </p>
        <div className="anim-up-3" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/register" className="btn btn-primary btn-lg">
            Ücretsiz başla →
          </Link>
          <Link href="/login" className="btn btn-lg">
            Giriş yap
          </Link>
        </div>

        {/* Stats */}
        <div className="anim-up-4" style={{ display: 'flex', gap: '32px', justifyContent: 'center', marginTop: '3rem', flexWrap: 'wrap' }}>
          {[
            { v: '18M+', l: 'Hedef öğrenci' },
            { v: '6', l: 'Dil desteği' },
            { v: '%60+', l: 'Başarı eşiği' },
            { v: '4', l: 'Haftalık plan' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div className="serif" style={{ fontSize: '28px', color: 'var(--accent)', fontWeight: 700 }}>{s.v}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Example cards */}
      <section style={{ padding: '2rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
          Örnek test senaryoları
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {examples.map((e, i) => (
            <div key={i} className="card anim-up" style={{ animationDelay: `${i * 0.05}s`, borderLeft: '3px solid var(--accent)' }}>
              <div style={{ fontSize: '11px', color: 'var(--accent)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {e.grade}
              </div>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{e.topic}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{e.count} soru · Türkçe</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '4rem 1.5rem', maxWidth: '900px', margin: '0 auto' }}>
        <h2 className="serif" style={{ fontSize: '32px', textAlign: 'center', marginBottom: '2rem' }}>
          Neden <span style={{ color: 'var(--accent)' }}>Pratium?</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {features.map((f, i) => (
            <div key={i} className="card anim-up" style={{ animationDelay: `${i * 0.06}s` }}>
              <div style={{ width: 48, height: 48, borderRadius: '14px', background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', marginBottom: '12px' }}>
                {f.icon}
              </div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: f.color }}>{f.title}</div>
              <div style={{ color: 'var(--text2)', fontSize: '13px', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ textAlign: 'center', padding: '4rem 1.5rem 6rem' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto', background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #A78BFA 100%)', borderRadius: '24px', padding: '2.5rem 2rem' }}>
          <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.75rem', color: '#fff' }}>
            Hemen dene
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '1.5rem', fontSize: '14px' }}>
            Kayıt ol, profilini oluştur, ilk testini al.
          </p>
          <Link href="/register" style={{
            display: 'block', background: '#fff', color: 'var(--accent)', fontWeight: 700,
            fontSize: '15px', padding: '14px 28px', borderRadius: '14px', textDecoration: 'none',
            transition: 'opacity 0.15s',
          }}>
            Ücretsiz hesap oluştur →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1.5px solid var(--border)', padding: '1.5rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ fontSize: '12px', color: 'var(--text3)' }}>© 2026 Pratium. Tüm hakları saklıdır.</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link href="/privacy" style={{ fontSize: '12px', color: 'var(--text3)', textDecoration: 'none' }}>Gizlilik</Link>
          <Link href="/terms" style={{ fontSize: '12px', color: 'var(--text3)', textDecoration: 'none' }}>Kullanım Şartları</Link>
        </div>
      </footer>
    </main>
  )
}
