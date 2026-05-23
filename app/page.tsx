'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const features = [
  { icon: '⚡', title: 'Anlık soru üretimi', desc: 'Konunu yaz, 10 saniyede sınıfına özel sorular hazır.' },
  { icon: '🎯', title: 'Sana özel zorluk', desc: 'AI sınıfını, yaşını ve geçmiş skorunu analiz eder.' },
  { icon: '🌍', title: 'Çoklu dil desteği', desc: 'Türkçe, İngilizce, Almanca ve daha fazlası.' },
  { icon: '📊', title: 'Gelişim takibi', desc: 'Her testin skoru kaydedilir, zayıf konular analiz edilir.' },
  { icon: '📋', title: '4 Haftalık Plan', desc: 'AI test geçmişini analiz ederek kişisel plan hazırlar.' },
  { icon: '🔥', title: 'Streak sistemi', desc: 'Günlük testlerle seriyi koru, liderboard\'da yüksel.' },
]

const faqs = [
  { q: 'Pratium ücretsiz mi?', a: 'Evet! Ücretsiz planda ayda 10 test hakkın var. Sınırsız test için Premium\'a geçebilirsin.' },
  { q: 'Nasıl test oluşturabilirim?', a: 'Quiz sayfasına git, bir konu seç veya yaz, zorluk ve soru sayısını belirle. Yapay zeka saniyeler içinde sana özel sorular üretir.' },
  { q: 'PDF veya dosyadan soru üretebilir miyim?', a: 'Evet! PDF, Word, görsel veya ses dosyası yükleyebilirsin. Yapay zeka o içerikten soru üretir.' },
  { q: 'Gelişim planı nedir?', a: 'En az 3 test çözdükten sonra yapay zeka test geçmişini analiz ederek 4 haftalık kişisel çalışma planı hazırlar.' },
  { q: 'Kaç dil destekleniyor?', a: 'Türkçe, İngilizce, Almanca, Fransızca, İspanyolca ve Arapça olmak üzere 6 dil destekleniyor.' },
  { q: 'Premium\'a nasıl geçebilirim?', a: 'Hesabına giriş yap, Planlar sayfasına git ve istediğin paketi seç. Ayrıca 10 arkadaşını davet ederek 1 yıl ücretsiz Premium kazanabilirsin.' },
]

export default function LandingPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useEffect(() => {
    const supabase = createClient() as any
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (user) router.replace('/quiz')
      else setChecking(false)
    })
  }, [])

  if (checking) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F172A' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#fff' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #e2e8f0',
        boxShadow: '0 2px 20px rgba(15,23,42,0.06)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1.5rem', height: '70px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/">
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '44px', width: 'auto' }} />
          </Link>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Link href="/login" style={{ fontSize: '14px', fontWeight: 500, color: '#3B566E', padding: '8px 16px' }}>
              Giriş yap
            </Link>
            <Link href="/register" className="btn btn-primary" style={{ fontSize: '14px' }}>
              Ücretsiz başla →
            </Link>
          </div>
        </div>
      </nav>

      <div style={{ height: '70px' }} />

      {/* ── HERO ── */}
      <section style={{
        background: 'linear-gradient(160deg, #0F172A 0%, #1a2d4a 50%, #0F172A 100%)',
        padding: '6rem 1.5rem 5rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Dekoratif glow */}
        <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '700px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, left: '5%', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(91,127,238,0.10) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: '5%', width: '350px', height: '350px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: '760px', margin: '0 auto' }}>
          {/* Badge */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(30,207,184,0.12)', border: '1px solid rgba(30,207,184,0.3)', borderRadius: '999px', padding: '6px 16px', marginBottom: '2rem' }}>
            <span style={{ fontSize: '14px' }}>✨</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#1ECFB8', letterSpacing: '0.05em' }}>AI DESTEKLİ SORU BANKASI</span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(2.2rem, 5vw, 4rem)', color: '#fff', lineHeight: 1.15, marginBottom: '1rem' }}>
            Pratik yap,{' '}
            <span style={{ background: 'linear-gradient(135deg, #5B7FEE, #1ECFB8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              başarıya ulaş.
            </span>
          </h1>

          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '18px', maxWidth: '540px', margin: '0 auto 2.5rem', lineHeight: 1.7 }}>
            Konunu yaz, sınıfını seç — Yapay Zeka saniyeler içinde sana özel çoktan seçmeli sorular üretsin.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '4rem' }}>
            <Link href="/register" className="btn btn-primary" style={{ fontSize: '16px', padding: '14px 32px' }}>
              Ücretsiz başla →
            </Link>
            <Link href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: '16px', fontWeight: 600,
              padding: '14px 32px', borderRadius: '999px', textDecoration: 'none',
              transition: 'background 0.2s',
            }}>
              Giriş yap
            </Link>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { v: '18M+', l: 'Hedef öğrenci' },
              { v: '6', l: 'Dil desteği' },
              { v: '4 Hafta', l: 'Kişisel plan' },
              { v: '%60+', l: 'Başarı eşiği' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '32px', color: '#fff', fontWeight: 800, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ÖZELLIKLER ── */}
      <section style={{ padding: '5rem 1.5rem', background: '#f8fafc' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="badge badge-accent" style={{ marginBottom: '1rem' }}>Neden Pratium?</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#0F172A' }}>
              Her öğrenciye özel deneyim
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {features.map((f, i) => (
              <div key={i} className="card" style={{ textAlign: 'center' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = 'var(--shadow-lg)'; e.currentTarget.style.borderColor = 'rgba(30,207,184,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = '' }}
              >
                <div style={{ width: 64, height: 64, borderRadius: '18px', background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 1rem', boxShadow: 'var(--shadow-accent)' }}>
                  {f.icon}
                </div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px', color: '#0F172A' }}>{f.title}</div>
                <div style={{ color: '#64748b', fontSize: '14px', lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NASIL ÇALIŞIR ── */}
      <section style={{ padding: '5rem 1.5rem', background: '#0F172A' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div className="badge badge-accent" style={{ marginBottom: '1rem' }}>Nasıl çalışır?</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', marginBottom: '3rem' }}>
            3 adımda başla
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '32px' }}>
            {[
              { n: '01', icon: '✍️', title: 'Konunu gir', desc: 'Hazır konulardan seç ya da kendi konunu yaz' },
              { n: '02', icon: '⚡', title: 'AI üretir', desc: 'Yapay zeka sınıfına özel sorular hazırlar' },
              { n: '03', icon: '📈', title: 'Gelişimini takip et', desc: 'Analiz ve gelişim planınla ilerle' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #5B7FEE, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', margin: '0 auto 1rem', boxShadow: 'var(--shadow-accent)' }}>
                  {s.icon}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '13px', color: '#1ECFB8', marginBottom: '6px', letterSpacing: '0.1em' }}>{s.n}</div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#fff', marginBottom: '8px' }}>{s.title}</div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SSS ── */}
      <section style={{ padding: '5rem 1.5rem', background: '#fff' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div className="badge badge-accent" style={{ marginBottom: '1rem' }}>SSS</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.5rem)', color: '#0F172A' }}>
              Sıkça sorulan sorular
            </h2>
          </div>
          {faqs.map((f, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', textAlign: 'left', padding: '1.25rem 0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', fontFamily: 'var(--font-sans)' }}
              >
                <span style={{ fontWeight: 600, fontSize: '15px', color: '#0F172A' }}>{f.q}</span>
                <span style={{ color: '#1ECFB8', fontSize: '20px', fontWeight: 300, flexShrink: 0, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
              </button>
              {openFaq === i && (
                <p style={{ padding: '0 0 1.25rem', fontSize: '14px', color: '#64748b', lineHeight: 1.8 }}>{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '5rem 1.5rem', background: 'linear-gradient(135deg, #0F172A 0%, #1a2d4a 100%)', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', marginBottom: '1rem' }}>
            Hemen başla, ücretsiz.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '16px', marginBottom: '2rem', lineHeight: 1.7 }}>
            Kredi kartı gerekmez. Kayıt ol ve ilk testini hemen çöz.
          </p>
          <Link href="/register" className="btn btn-primary" style={{ fontSize: '16px', padding: '14px 36px' }}>
            Ücretsiz hesap oluştur →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#071220', padding: '2rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '36px' }} />
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {[
              { href: '/privacy', label: 'Gizlilik' },
              { href: '/terms', label: 'Kullanım Şartları' },
              { href: '/pricing', label: 'Planlar' },
            ].map(l => (
              <Link key={l.href} href={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#1ECFB8')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
                {l.label}
              </Link>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>© 2026 Pratium. Tüm hakları saklıdır.</p>
        </div>
      </footer>
    </main>
  )
}
