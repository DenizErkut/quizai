'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const features = [
  { icon: '⚡', title: 'Anlık soru üretimi', desc: 'Konunu yaz, 10 saniyede sınıfına ve seviyene özel sorular hazır. Müfredat dışı konular da desteklenir.' },
  { icon: '📝', title: '8 Farklı Soru Tipi', desc: 'Çoktan seçmeli, boşluk doldurma, doğru/yanlış, eşleştirme, sıralama, kısa cevap — ve Maarif Modeline özel çoklu D/Y ve tablo doldurma.' },
  { icon: '🏫', title: 'Sınıf & Öğretmen Sistemi', desc: 'Öğretmenler sınıf oluşturur, ödev atar, öğrenci performansını takip eder. AI her öğrenci için ayrı analiz hazırlar.' },
  { icon: '📊', title: 'Kişisel Analiz & Zayıf Konular', desc: 'Her test sonucu kaydedilir. 10 test sonrasında AI zayıf konularını tespit eder, detaylı rapor sunar.' },
  { icon: '📋', title: '4 Haftalık Gelişim Planı', desc: 'AI test geçmişini analiz ederek sana özel 4 haftalık çalışma planı hazırlar. Hedefini belirle, planı takip et.' },
  { icon: '📁', title: 'Dosyadan Soru Üret', desc: 'PDF, Word veya görsel yükle — AI o içerikten soru üretir. LGS, YKS ve okul sınavlarına hazırlık için ideal.' },
]

const faqs = [
  { q: 'Pratium ucretsiz plan neye kadar kullanılabilir?', a: 'Freemium planda ayda 10 test, test başına 5 soru ve temel soru tipleri ücretsiz kullanılabilir. Müfredat dışı konular, Maarif Modeli soru tipleri ve dosya yükleme Premium plana dahildir.' },
  { q: 'Maarif Modeli soru tipleri neler?', a: 'Pratiumda 8 farklı soru tipi var: Çoktan Seçmeli, Boşluk Doldurma, Doğru/Yanlış, Eşleştirme, Sıralama, Kısa Cevap ve Maarif Modeline özel Çoklu D/Y (birden fazla ifadeyi değerlendirme) ile Tablo Doldurma. Freemium planda temel tipler, Premium ve üstünde tüm tipler açık.' },
  { q: 'Öğretmen paneli nasıl çalışır?', a: 'Öğretmenler başvuru yapıp onaylandıktan sonra sınıf oluşturabilir, öğrencilere davet kodu gönderebilir, ödev atayabilir ve her öğrencinin performansını takip edebilir. AI, yanlış cevaplar üzerinden öğrenci özelinde analiz hazırlar. Toplu bildirim gönderme özelliği de mevcut.' },
  { q: 'Sınıf sistemine nasıl katılabilirim?', a: 'Öğretmenin sana davet kodu verir. Uygulamada "Sınıflarım" bölümüne gidip kodu girerek katılabilirsin. Premium planda birden fazla sınıfa aynı anda üye olabilirsin.' },
  { q: 'PDF veya dosyadan soru üretebilir miyim?', a: 'Evet! PDF ve Word dosyası yükleyebilirsin. Yapay zeka o içerikten soru üretir. Bu özellik Premium ve Unlimited planlarda kullanılabilir.' },
  { q: 'Gelişim planı için kaç test çözmem gerekiyor?', a: 'En az 10 test çözdükten sonra yapay zeka test geçmişini analiz ederek 4 haftalık kişisel çalışma planı hazırlar. Daha fazla test çözdükçe plan daha isabetli olur.' },
  { q: 'Premium ve Unlimited arasındaki fark nedir?', a: 'Premiumda ayda 300 test, test başına 20 soru, tüm soru tipleri, PDF yükleme, sınıf sistemi ve öncelikli destek var (₺600/yıl). Unlimitedda ise sınırsız aylık test, tüm özellikler, gelişmiş analiz raporları ve yılda 12 birebir koç görüşmesi bulunuyor (₺6.000/yıl).' },
  { q: 'Kaç dil destekleniyor?', a: 'Türkçe, İngilizce, Almanca, Fransızca, İspanyolca ve Arapça olmak üzere 6 dil destekleniyor. Test arayüzü seçtiğin dilde üretilir.' },
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
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <Link href="/login" style={{
              color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 600,
              padding: '9px 20px', borderRadius: '8px', border: '1.5px solid rgba(255,255,255,0.2)',
              transition: 'all 0.15s', background: 'rgba(255,255,255,0.05)',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}>
              Giriş yap
            </Link>
            <Link href="/register" style={{
              background: '#fdd31d', color: '#082465', fontSize: '14px', fontWeight: 700,
              padding: '9px 22px', borderRadius: '8px', whiteSpace: 'nowrap',
              transition: 'all 0.15s', boxShadow: '0 4px 12px rgba(253,211,29,0.35)',
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
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fdd31d', letterSpacing: '0.08em' }}>AI DESTEKLİ — MAARIF MODELİ UYUMLU</span>
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(2rem, 5vw, 3.8rem)', color: '#fff', lineHeight: 1.15, marginBottom: '1.25rem' }}>
            Pratik yap,{' '}
            <span style={{ color: '#1ECFB8' }}>başarıya ulaş.</span>
          </h1>

          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '17px', maxWidth: '540px', margin: '0 auto 2.5rem', lineHeight: 1.7 }}>
            Konunu yaz, sınıfını seç — Yapay Zeka saniyeler içinde 8 farklı soru tipiyle sana özel testler üretsin. Öğretmen paneli, sınıf sistemi ve Maarif Modeli desteğiyle.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '3rem' }}>
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
              { v: '8', l: 'Soru tipi' },
              { v: '6', l: 'Dil desteği' },
              { v: '4 Hafta', l: 'Kişiselleştirilmiş plan' },
              { v: "Her Seviye", l: "İlkokuldan KPSS'ye" },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '28px', color: '#fdd31d', fontWeight: 800, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KİM İÇİN? ── */}
      <section style={{ background: '#f8fafc', padding: '5rem 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ display: 'inline-block', background: 'rgba(8,36,101,0.06)', borderRadius: '99px', padding: '5px 16px', fontSize: '12px', fontWeight: 700, color: '#082465', letterSpacing: '0.06em', marginBottom: '12px' }}>
              KİM İÇİN?
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(1.6rem, 3vw, 2.5rem)', color: '#082465', margin: 0 }}>
              Herkes için, her seviyede
            </h2>
            <p style={{ color: '#64748b', fontSize: '15px', marginTop: '10px' }}>
              İlkokuldan üniversiteye, öğrenciden öğretmene — Pratium herkese özel çalışır.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px,100%), 1fr))', gap: '16px' }}>
            {[
              {
                emoji: '🎒',
                role: 'Öğrenci',
                color: '#0ea5e9',
                bg: 'rgba(14,165,233,0.06)',
                border: 'rgba(14,165,233,0.2)',
                headline: 'Konuyu yaz, testi al',
                points: ['AI ile kişisel soru üretimi', 'Zayıf konuları tespit et', '4 haftalık çalışma planı', 'LGS, YKS, KPSS hazırlık', 'Spaced repetition tekrarı'],
                cta: 'Ücretsiz başla',
                href: '/register',
              },
              {
                emoji: '👩‍🏫',
                role: 'Öğretmen',
                color: '#6366f1',
                bg: 'rgba(99,102,241,0.06)',
                border: 'rgba(99,102,241,0.2)',
                headline: 'Sınıfını yönet, takip et',
                points: ['Sınıf oluştur, öğrenci ekle', 'Ödev ata ve sonuçları gör', 'Canlı quiz — anlık sonuç', 'Öğrenci performans raporu', 'Toplu bildirim gönder'],
                cta: 'Öğretmen başvurusu',
                href: '/register/teacher',
              },
              {
                emoji: '👨‍👩‍👧',
                role: 'Veli',
                color: '#10b981',
                bg: 'rgba(16,185,129,0.06)',
                border: 'rgba(16,185,129,0.2)',
                headline: 'Çocuğunun gelişimini izle',
                points: ['Haftalık özet e-postası', 'Test ve konu bazlı analiz', 'Zayıf konuları anlık gör', 'Streak ve motivasyon takibi', 'Çocuğunla bağlı kal'],
                cta: 'Veli girişi',
                href: '/login/parent',
              },
              {
                emoji: '🏛️',
                role: 'Kurum',
                color: '#f59e0b',
                bg: 'rgba(245,158,11,0.06)',
                border: 'rgba(245,158,11,0.2)',
                headline: 'Okulunu dijitalleştir',
                points: ['Toplu öğrenci kaydı', 'Kurum bazlı raporlama', 'Çoklu öğretmen yönetimi', 'Özel içerik ve müfredat', 'Öncelikli destek hattı'],
                cta: 'Kurum başvurusu',
                href: '/register/institution',
              },
            ].map((card) => (
              <div key={card.role} style={{
                background: '#fff',
                borderRadius: '20px',
                border: `1.5px solid ${card.border}`,
                padding: '28px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0',
                boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${card.border}` }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = ''; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 16px rgba(0,0,0,0.05)' }}
              >
                {/* Emoji + Rol */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '14px', background: card.bg, border: `1.5px solid ${card.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>
                    {card.emoji}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '17px', color: '#082465' }}>{card.role}</div>
                    <div style={{ fontSize: '12px', color: card.color, fontWeight: 600 }}>{card.headline}</div>
                  </div>
                </div>

                {/* Maddeler */}
                <ul style={{ listStyle: 'none', margin: '0 0 20px', padding: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  {card.points.map((p, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#475569' }}>
                      <span style={{ color: card.color, fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>✓</span>
                      {p}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <a href={card.href} style={{
                  display: 'block', textAlign: 'center',
                  padding: '10px 16px', borderRadius: '10px',
                  background: card.bg, border: `1.5px solid ${card.border}`,
                  color: card.color, fontWeight: 700, fontSize: '13px',
                  textDecoration: 'none', marginTop: 'auto',
                  transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = card.color; (e.currentTarget as HTMLAnchorElement).style.color = '#fff' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = card.bg; (e.currentTarget as HTMLAnchorElement).style.color = card.color }}
                >
                  {card.cta} →
                </a>
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
              Öğrenci, öğretmen ve veli için tasarlandı
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
              { n: '01', icon: '✍️', title: 'Konunu gir', desc: 'Hazır konulardan seç, kendi konunu yaz ya da PDF yükle' },
              { n: '02', icon: '⚡', title: 'AI üretir', desc: 'Yapay zeka 8 farklı soru tipiyle sınıfına özel test hazırlar' },
              { n: '03', icon: '📈', title: 'Gelişimini takip et', desc: 'Zayıf konularını gör, 4 haftalık planınla hedefe ilerle' },
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

      {/* ── PLAN ÖZET ── */}
      <section style={{ padding: '4.5rem 1.5rem', background: '#f8fafc' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <div style={{ display: 'inline-block', background: 'rgba(8,36,101,0.06)', color: '#082465', fontSize: '11px', fontWeight: 700, padding: '5px 14px', borderRadius: '999px', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '12px' }}>
              Üyelik Planları
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', color: '#082465', fontWeight: 800 }}>
              Ücretsiz başla, ihtiyacın artınca yükselt
            </h2>
            <p style={{ color: '#64748b', fontSize: '15px', marginTop: '10px' }}>Kredi kartı gerekmez.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {[
              {
                label: 'Freemium', price: '₺0', sub: 'Sonsuza kadar', color: '#64748b',
                features: ['Ayda 10 test', 'Test başına 5 soru', 'Müfredat konuları', 'Temel soru tipleri', 'Arşiv & dashboard'],
                cta: 'Ücretsiz başla', href: '/register', accent: false,
              },
              {
                label: 'Premium', price: '₺600', sub: '/yıl', color: '#2563eb', badge: '🏆 En popüler',
                features: ['Ayda 300 test', 'Test başına 20 soru', 'Tüm konular (müfredat dışı dahil)', 'Tüm Maarif Modeli soru tipleri', 'PDF & dosyadan soru üret', 'Sınıf sistemi', 'Detaylı analiz & gelişim planı', 'Öncelikli destek'],
                cta: 'Premiuma geç →', href: '/pricing', accent: true,
              },
              {
                label: 'Unlimited', price: '₺6.000', sub: '/yıl', color: '#0d9488',
                features: ['Sınırsız aylık test', 'Test başına 20 soru', 'Tüm özellikler kısıtsız', 'Gelişmiş analiz & raporlar', 'Sınırsız sınıf', '12× birebir koç görüşmesi', 'Öncelikli & telefon desteği'],
                cta: 'Unlimiteda geç →', href: '/pricing', accent: false,
              },
            ].map((p, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: '20px', padding: '2rem', border: p.accent ? '2px solid #2563eb' : '1px solid #e2e8f0', boxShadow: p.accent ? '0 8px 32px rgba(37,99,235,0.12)' : '0 2px 12px rgba(8,36,101,0.06)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                {p.badge && (
                  <div style={{ position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)', background: '#2563eb', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '4px 14px', borderRadius: '999px', whiteSpace: 'nowrap' }}>{p.badge}</div>
                )}
                <div style={{ fontSize: '12px', fontWeight: 700, color: p.color, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{p.label}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '28px', fontWeight: 800, color: '#082465' }}>{p.price}</span>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>{p.sub}</span>
                </div>
                <div style={{ height: '1px', background: '#e2e8f0', margin: '1rem 0' }} />
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  {p.features.map((f, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#475569' }}>
                      <span style={{ color: p.color, fontWeight: 700, flexShrink: 0, marginTop: '1px' }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <a href={p.href} style={{ display: 'block', textAlign: 'center', padding: '11px 20px', borderRadius: '999px', fontWeight: 700, fontSize: '14px', textDecoration: 'none', background: p.accent ? '#2563eb' : 'transparent', color: p.accent ? '#fff' : p.color, border: `2px solid ${p.color}`, transition: 'all 0.15s' }}>
                  {p.cta}
                </a>
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
