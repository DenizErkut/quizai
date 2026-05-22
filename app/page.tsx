'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const features = [
  { icon: '⚡', title: 'Anlık soru üretimi', desc: 'Konunu yaz, 10 saniyede sınıfına özel sorular hazır.', color: '#FF6B6B', bg: 'rgba(255,107,107,0.12)' },
  { icon: '🎯', title: 'Sana özel zorluk', desc: 'AI sınıfını, yaşını ve geçmiş skorunu analiz eder.', color: '#EC4899', bg: 'rgba(236,72,153,0.12)' },
  { icon: '🌍', title: 'Çoklu dil desteği', desc: 'Türkçe, İngilizce, Almanca ve daha fazlası.', color: '#16A34A', bg: 'rgba(22,163,74,0.12)' },
  { icon: '📊', title: 'Gelişim takibi', desc: 'Her testin skoru kaydedilir, zayıf konular analiz edilir.', color: '#D97706', bg: 'rgba(217,119,6,0.12)' },
  { icon: '📋', title: '4 Haftalık Plan', desc: 'AI test geçmişini analiz ederek kişisel plan hazırlar.', color: '#8B5CF6', bg: 'rgba(139,92,246,0.12)' },
  { icon: '🔥', title: 'Streak sistemi', desc: 'Günlük testlerle seriyi koru, liderboard\'da yüksel.', color: '#FF8E53', bg: 'rgba(255,142,83,0.12)' },
]

const faqs = [
  { q: 'Pratium ücretsiz mi?', a: 'Evet! Ücretsiz planda ayda 10 test hakkın var. Sınırsız test için Premium\'a geçebilirsin.' },
  { q: 'Nasıl test oluşturabilirim?', a: 'Quiz sayfasına git, bir konu seç veya yaz, zorluk ve soru sayısını belirle. Yapay zeka saniyeler içinde sana özel sorular üretir.' },
  { q: 'PDF veya dosyadan soru üretebilir miyim?', a: 'Evet! PDF, Word, görsel veya ses dosyası yükleyebilirsin. Yapay zeka o içerikten soru üretir.' },
  { q: 'Gelişim planı nedir?', a: 'En az 3 test çözdükten sonra yapay zeka test geçmişini analiz ederek 4 haftalık kişisel çalışma planı hazırlar ve konuları otomatik takip eder.' },
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
      if (user) { router.replace('/quiz') } else { setChecking(false) }
    })
  }, [])

  if (checking) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0F0A1E' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ position: 'relative', minHeight: '100vh', background: '#ffffff' }}>

      {/* ── NAV ── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 2rem', height: '72px',
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(15,10,30,0.95)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/pratium-logo.png" alt="Pratium" style={{ height: '80px', width: 'auto' }} />
        </Link>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <Link href="/login" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: '14px', fontWeight: 500, padding: '8px 16px' }}>
            Giriş yap
          </Link>
          <Link href="/register" style={{
            background: 'linear-gradient(135deg, #FF6B6B, #EC4899)',
            color: '#fff', textDecoration: 'none', fontSize: '14px', fontWeight: 700,
            padding: '10px 22px', borderRadius: '99px', whiteSpace: 'nowrap',
          }}>
            Ücretsiz başla →
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{
        background: 'linear-gradient(180deg, #0F0A1E 0%, #1A0F3C 60%, #0F0A1E 100%)',
        padding: '6rem 1.5rem 5rem', textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Dekoratif blob'lar */}
        <div style={{ position: 'absolute', top: '-100px', left: '50%', transform: 'translateX(-50%)', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,107,107,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '0', left: '10%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '0', right: '10%', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,107,107,0.15)', border: '1px solid rgba(255,107,107,0.3)', borderRadius: '99px', padding: '6px 16px', marginBottom: '2rem' }}>
            <span style={{ fontSize: '12px', color: '#FF6B6B', fontWeight: 700, letterSpacing: '0.05em' }}>✨ AI DESTEKLİ SORU BANKASI</span>
          </div>

          <h1 className="serif" style={{
            fontSize: 'clamp(2.8rem, 7vw, 5.5rem)', lineHeight: 1.1,
            color: '#ffffff', marginBottom: '0.5rem',
          }}>
            Pratik yap,
          </h1>
          <h1 className="serif" style={{
            fontSize: 'clamp(2.8rem, 7vw, 5.5rem)', lineHeight: 1.1,
            background: 'linear-gradient(135deg, #FF6B6B, #EC4899, #8B5CF6)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text', marginBottom: '1.5rem',
          }}>
            başarıya ulaş.
          </h1>

          <p style={{
            color: 'rgba(255,255,255,0.6)', fontSize: '18px', maxWidth: '560px',
            margin: '0 auto 2.5rem', lineHeight: 1.7,
          }}>
            Konunu yaz, sınıfını seç — Yapay Zeka saniyeler içinde sana özel
            çoktan seçmeli sorular üretsin.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '4rem' }}>
            <Link href="/register" style={{
              background: 'linear-gradient(135deg, #FF6B6B, #EC4899)',
              color: '#fff', textDecoration: 'none', fontSize: '16px', fontWeight: 700,
              padding: '14px 32px', borderRadius: '99px',
              boxShadow: '0 8px 32px rgba(255,107,107,0.35)',
            }}>
              Ücretsiz başla →
            </Link>
            <Link href="/login" style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', textDecoration: 'none', fontSize: '16px', fontWeight: 600,
              padding: '14px 32px', borderRadius: '99px',
            }}>
              Giriş yap
            </Link>
          </div>

          {/* Sosyal kanıt */}
          <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { v: '18M+', l: 'Hedef öğrenci' },
              { v: '6', l: 'Dil desteği' },
              { v: '4 Hafta', l: 'Kişisel plan' },
              { v: '%60+', l: 'Başarı eşiği' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div className="serif" style={{ fontSize: '32px', color: '#fff', fontWeight: 700, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ÖZELLIKLER ── */}
      <section style={{ padding: '5rem 1.5rem', background: '#fafafa' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#FF6B6B', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Neden Pratium?</div>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 4vw, 3rem)', color: '#1E1B3A', margin: 0 }}>
              Her öğrenciye özel deneyim
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {features.map((f, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: '20px', padding: '1.75rem',
                border: '1.5px solid rgba(0,0,0,0.06)',
                boxShadow: '0 2px 16px rgba(0,0,0,0.04)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}>
                <div style={{ width: 52, height: 52, borderRadius: '16px', background: f.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', marginBottom: '14px' }}>
                  {f.icon}
                </div>
                <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '6px', color: '#1E1B3A' }}>{f.title}</div>
                <div style={{ color: '#6B7280', fontSize: '14px', lineHeight: 1.7 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── NASIL ÇALIŞIR ── */}
      <section style={{ padding: '5rem 1.5rem', background: '#0F0A1E' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#FF6B6B', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>Nasıl çalışır?</div>
          <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#fff', marginBottom: '3rem' }}>
            3 adımda başla
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
            {[
              { n: '1', icon: '✍️', title: 'Konunu gir', desc: 'Hazır konulardan seç ya da kendi konunu yaz' },
              { n: '2', icon: '⚡', title: 'AI üretir', desc: 'Yapay zeka sınıfına özel sorular hazırlar' },
              { n: '3', icon: '📈', title: 'Gelişimini takip et', desc: 'Analiz ve gelişim planınla ilerle' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #FF6B6B, #EC4899)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(255,107,107,0.3)' }}>
                  {s.icon}
                </div>
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
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#FF6B6B', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>SSS</div>
            <h2 className="serif" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', color: '#1E1B3A', margin: 0 }}>
              Sık sorulan sorular
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ borderRadius: '16px', border: `1.5px solid ${openFaq === i ? 'rgba(255,107,107,0.3)' : 'rgba(0,0,0,0.07)'}`, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', background: openFaq === i ? 'rgba(255,107,107,0.04)' : '#fff', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--font-sans)' }}>
                  <span style={{ fontWeight: 600, fontSize: '15px', color: '#1E1B3A' }}>{faq.q}</span>
                  <span style={{ fontSize: '20px', color: '#FF6B6B', flexShrink: 0, marginLeft: '12px', transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s' }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: '0 1.5rem 1.25rem', fontSize: '14px', color: '#6B7280', lineHeight: 1.8 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '5rem 1.5rem', background: 'linear-gradient(135deg, #0F0A1E 0%, #1A0F3C 100%)', textAlign: 'center' }}>
        <h2 className="serif" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', color: '#fff', marginBottom: '1rem' }}>
          Hemen dene, ücretsiz!
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '16px', marginBottom: '2rem' }}>
          Kayıt ol, profilini oluştur, ilk testini al.
        </p>
        <Link href="/register" style={{
          display: 'inline-block', background: 'linear-gradient(135deg, #FF6B6B, #EC4899)',
          color: '#fff', textDecoration: 'none', fontSize: '16px', fontWeight: 700,
          padding: '16px 40px', borderRadius: '99px',
          boxShadow: '0 8px 32px rgba(255,107,107,0.4)',
        }}>
          Ücretsiz hesap oluştur →
        </Link>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#080512', padding: '3rem 2rem 2rem', color: 'rgba(255,255,255,0.5)' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
            <div>
              <img src="/pratium-logo.png" alt="Pratium" style={{ height: '60px', marginBottom: '12px' }} />
              <p style={{ fontSize: '13px', lineHeight: 1.7, margin: 0 }}>Yapay zeka destekli kişiselleştirilmiş test platformu.</p>
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                {[
                  { label: 'Instagram', href: 'https://instagram.com/pratium', icon: '📷' },
                  { label: 'TikTok', href: 'https://tiktok.com/@pratium', icon: '🎵' },
                  { label: 'WhatsApp', href: '#', icon: '💬' },
                ].map((s, i) => (
                  <a key={i} href={s.href} style={{ width: 36, height: 36, borderRadius: '10px', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', textDecoration: 'none' }}>
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#FF6B6B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Platform</div>
              {['Quiz', 'Günlük test', 'Analiz', 'Gelişim planı', 'Sıralama'].map((l, i) => (
                <div key={i} style={{ marginBottom: '10px' }}>
                  <Link href={`/${l.toLowerCase().replace(' ', '-')}`} style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: '14px' }}>{l}</Link>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#FF6B6B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Hesap</div>
              {[['Kayıt ol', '/register'], ['Giriş yap', '/login'], ['Premium', '/pricing'], ['Davet et', '/referral']].map(([l, h], i) => (
                <div key={i} style={{ marginBottom: '10px' }}>
                  <Link href={h} style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: '14px' }}>{l}</Link>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#FF6B6B', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '16px' }}>Yasal</div>
              {[['Gizlilik Politikası', '/privacy'], ['Kullanım Şartları', '/terms'], ['KVKK', '/privacy']].map(([l, h], i) => (
                <div key={i} style={{ marginBottom: '10px' }}>
                  <Link href={h} style={{ color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontSize: '14px' }}>{l}</Link>
                </div>
              ))}
              <div style={{ marginTop: '16px', fontSize: '13px' }}>
                <a href="mailto:info@pratium.com" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none' }}>info@pratium.com</a>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '13px' }}>© 2026 Pratium. Tüm hakları saklıdır.</span>
            <span style={{ fontSize: '13px' }}>pratium.com</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
