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
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#082465' }}>
      <div className="spinner" style={{ borderTopColor: '#fdd31d' }} />
    </main>
  )

  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#fff', fontFamily: 'var(--font-sans)' }}>

      {/* ── NAV ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#082465',
        boxShadow: '0 2px 20px rgba(8,36,101,0.3)',
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 1.5rem', height: '90px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/">
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '40px', width: 'auto', filter: 'brightness(0) invert(1)' }} />
          </Link>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {['Test', 'Günlük', 'Analiz', 'Planlar'].map(l => (
              <Link key={l} href={l === 'Test' ? '/quiz' : l === 'Günlük' ? '/daily' : l === 'Analiz' ? '/analysis' : '/pricing'}
                style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500, padding: '7px 14px', borderRadius: '8px', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fdd31d')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}>
                {l}
              </Link>
            ))}
            <Link href="/login" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500, padding: '7px 14px' }}>
              Giriş yap
            </Link>
            <Link href="/register" style={{
              background: '#fdd31d', color: '#082465', fontSize: '13px', fontWeight: 700,
              padding: '9px 20px', borderRadius: '8px', whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5c800'; e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fdd31d'; e.currentTarget.style.transform = '' }}>
              Ücretsiz başla
            </Link>
          </div>
        </div>
      </nav>

      <div style={{ height: '90px' }} />

      {/* ── HERO ── */}
      <section style={{
        background: 'linear-gradient(135deg, #082465 0%, #0f3a8a 60%, #082465 100%)',
        padding: '5rem 1.5rem 4rem',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '-80px', left: '50%', transform: 'translateX(-50%)', width: '700px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(253,211,29,0.08) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: '5%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(30,207,184,0.10) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(253,211,29,0.12)', border: '1px solid rgba(253,211,29,0.3)', borderRadius: '999px', padding: '6px 16px', marginBottom: '2rem' }}>
            <span style={{ fontSize: '13px' }}>✨</span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fdd31d', letterSpacing: '0.08em' }}>AI DESTEKLİ SORU BANKASI</span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(2rem, 5vw, 3.8rem)', color: '#fff', lineHeight: 1.15, marginBottom: '1.25rem' }}>
            Pratik yap,{' '}
            <span style={{ color: '#1ECFB8' }}>başarıya ulaş.</span>
          </h1>

          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '17px', maxWidth: '540px', margin: '0 auto 2.5rem', lineHeight: 1.7 }}>
            Konunu yaz, sınıfını seç — Yapay Zeka saniyeler içinde sana özel çoktan seçmeli sorular üretsin.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '4rem' }}>
            <Link href="/register" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: '#fdd31d', color: '#082465', fontSize: '15px', fontWeight: 700,
              padding: '13px 30px', borderRadius: '999px', textDecoration: 'none',
              boxShadow: '0 8px 24px rgba(253,211,29,0.4)', transition: 'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 32px rgba(253,211,29,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 8px 24px rgba(253,211,29,0.4)' }}>
              Ücretsiz başla →
            </Link>
            <Link href="/login" style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.2)',
              color: '#fff', fontSize: '15px', fontWeight: 600,
              padding: '13px 28px', borderRadius: '999px', textDecoration: 'none',
              transition: 'all 0.2s',
            }}>
              Giriş yap
            </Link>
          </div>

          <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { v: '18M+', l: 'Hedef öğrenci' },
              { v: '6', l: 'Dil desteği' },
              { v: '4 Hafta', l: 'Kişisel plan' },
              { v: '%60+', l: 'Başarı eşiği' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '30px', color: '#fdd31d', fontWeight: 800, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ÖZELLIKLER ── */}
      <section style={{ padding: '5rem 1.5rem', background: '#f8fafc' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ display: 'inline-block', background: 'rgba(30,207,184,0.1)', color: '#0a9e90', fontSize: '11px', fontWeight: 700, padding: '5px 14px', borderRadius: '999px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
              Neden Pratium?
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.5rem)', color: '#082465' }}>
              Her öğrenciye özel deneyim
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {features.map((f, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: '16px', padding: '1.75rem',
                border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(8,36,101,0.06)',
                transition: 'all 0.25s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 36px rgba(8,36,101,0.12)'; e.currentTarget.style.borderColor = 'rgba(30,207,184,0.3)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 12px rgba(8,36,101,0.06)'; e.currentTarget.style.borderColor = '#e2e8f0' }}
              >
                <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', marginBottom: '14px', boxShadow: '0 4px 14px rgba(8,36,101,0.2)' }}>
                  {f.icon}
                </div>
                <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px', color: '#082465' }}>{f.title}</div>
                <div style={{ color: '#64748b', fontSize: '13px', lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SARI BAND — NASIL ÇALIŞIR ── */}
      <section style={{ background: '#fdd31d', padding: '4rem 1.5rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', color: '#082465', fontWeight: 800 }}>
              3 adımda başla
            </h2>
            <p style={{ color: 'rgba(8,36,101,0.6)', fontSize: '15px', marginTop: '8px' }}>
              Kayıt ol ve ilk testini saniyeler içinde çöz.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px' }}>
            {[
              { n: '01', icon: '✍️', title: 'Konunu gir', desc: 'Hazır konulardan seç ya da kendi konunu yaz' },
              { n: '02', icon: '⚡', title: 'AI üretir', desc: 'Yapay zeka sınıfına özel sorular hazırlar' },
              { n: '03', icon: '📈', title: 'Gelişimini takip et', desc: 'Analiz ve gelişim planınla ilerle' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', background: 'rgba(255,255,255,0.5)', borderRadius: '16px', padding: '2rem 1.5rem', border: '1.5px solid rgba(8,36,101,0.1)' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#082465', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', margin: '0 auto 14px' }}>
                  {s.icon}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '12px', color: '#082465', marginBottom: '6px', letterSpacing: '0.1em', opacity: 0.5 }}>{s.n}</div>
                <div style={{ fontWeight: 700, fontSize: '15px', color: '#082465', marginBottom: '8px' }}>{s.title}</div>
                <div style={{ fontSize: '13px', color: 'rgba(8,36,101,0.6)', lineHeight: 1.6 }}>{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SSS ── */}
      <section style={{ padding: '5rem 1.5rem', background: '#fff' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ display: 'inline-block', background: 'rgba(30,207,184,0.1)', color: '#0a9e90', fontSize: '11px', fontWeight: 700, padding: '5px 14px', borderRadius: '999px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>SSS</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', color: '#082465' }}>
              Sıkça sorulan sorular
            </h2>
          </div>
          {faqs.map((f, i) => (
            <div key={i} style={{ borderBottom: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: '100%', textAlign: 'left', padding: '1.25rem 0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', fontFamily: 'var(--font-sans)' }}>
                <span style={{ fontWeight: 600, fontSize: '15px', color: '#082465' }}>{f.q}</span>
                <span style={{ color: '#1ECFB8', fontSize: '22px', fontWeight: 300, flexShrink: 0, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
              </button>
              {openFaq === i && (
                <p style={{ padding: '0 0 1.25rem', fontSize: '14px', color: '#64748b', lineHeight: 1.8 }}>{f.a}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '5rem 1.5rem', background: 'linear-gradient(135deg, #082465 0%, #0f3a8a 100%)', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', color: '#fff', marginBottom: '1rem', fontWeight: 800 }}>
            Hemen başla, ücretsiz.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '16px', marginBottom: '2rem', lineHeight: 1.7 }}>
            Kredi kartı gerekmez. Kayıt ol ve ilk testini hemen çöz.
          </p>
          <Link href="/register" style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            background: '#fdd31d', color: '#082465', fontSize: '15px', fontWeight: 700,
            padding: '14px 36px', borderRadius: '999px', textDecoration: 'none',
            boxShadow: '0 8px 24px rgba(253,211,29,0.4)',
          }}>
            Ücretsiz hesap oluştur →
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#082465', padding: '2rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '72px', filter: 'brightness(0) invert(1)' }} />
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {[{ href: '/privacy', label: 'Gizlilik' }, { href: '/terms', label: 'Kullanım Şartları' }, { href: '/pricing', label: 'Planlar' }].map(l => (
              <Link key={l.href} href={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', transition: 'color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#fdd31d')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}>
                {l.label}
              </Link>
            ))}
          </div>
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>© 2026 Pratium.</p>
        </div>
      </footer>
    </main>
  )
}
