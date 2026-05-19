'use client'
import Link from 'next/link'

const features = [
  { icon: '⚡', title: 'Anlık soru üretimi', desc: 'Konunu yaz, 10 saniyede sınıfına özel sorular hazır.' },
  { icon: '🎯', title: 'Sana özel zorluk', desc: 'AI sınıfını, yaşını ve geçmiş skorunu analiz eder.' },
  { icon: '🌍', title: 'Çoklu dil', desc: 'Türkçe, İngilizce, Almanca ve daha fazlası.' },
  { icon: '📊', title: 'İlerleme takibi', desc: 'Her testin skoru kaydedilir, zayıf konular analiz edilir.' },
]

const examples = [
  { grade: 'Üniversite 1. sınıf', topic: 'Uçağın kısımları', count: 10 },
  { grade: 'Ortaokul 6. sınıf', topic: 'Asal sayılar ve OBEB', count: 10 },
  { grade: 'Lise 11. sınıf', topic: 'Organik kimya', count: 15 },
  { grade: 'İlkokul 4. sınıf', topic: 'Çarpım tablosu', count: 5 },
]

export default function LandingPage() {
  return (
    <main style={{ position: 'relative', minHeight: '100vh' }}>
      <div className="glow-blob" style={{ top: '-100px', left: '50%', transform: 'translateX(-50%)' }} />

      {/* Nav */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: 'rgba(14,14,16,0.85)',
        backdropFilter: 'blur(12px)', zIndex: 100,
      }}>
        <span className="serif" style={{ fontSize: '22px', letterSpacing: '-0.01em' }}>
          Quiz<span style={{ color: 'var(--accent)' }}>AI</span>
        </span>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/login" className="btn btn-ghost btn-sm">Giriş yap</Link>
          <Link href="/register" className="btn btn-primary btn-sm">Başla</Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '6rem 1.5rem 4rem', position: 'relative', zIndex: 1 }}>
        <div className="badge badge-purple anim-up" style={{ marginBottom: '1.5rem' }}>
          AI destekli soru bankası
        </div>
        <h1 className="serif anim-up-1" style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)', lineHeight: 1.1,
          letterSpacing: '-0.02em', marginBottom: '1.25rem',
          maxWidth: '800px', margin: '0 auto 1.25rem',
        }}>
          Sınıfına özel<br />
          <em style={{ color: 'var(--accent2)', fontStyle: 'italic' }}>anlık testler</em>
        </h1>
        <p className="anim-up-2" style={{
          color: 'var(--text2)', fontSize: '17px', maxWidth: '520px',
          margin: '0 auto 2.5rem', lineHeight: 1.7,
        }}>
          Konunu yaz, sınıfını seç — Claude AI saniyeler içinde sana özel
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
      </section>

      {/* Example cards */}
      <section style={{ padding: '2rem 1.5rem', maxWidth: '900px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '1.25rem' }}>
          Örnek test senaryoları
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          {examples.map((e, i) => (
            <div key={i} className="card-sm anim-up" style={{ animationDelay: `${i * 0.05}s` }}>
              <div style={{ fontSize: '11px', color: 'var(--accent2)', marginBottom: '6px', fontWeight: 600 }}>
                {e.grade}
              </div>
              <div style={{ fontWeight: 500, marginBottom: '4px' }}>{e.topic}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{e.count} soru · Türkçe</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '4rem 1.5rem', maxWidth: '900px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {features.map((f, i) => (
            <div key={i} className="card anim-up" style={{ animationDelay: `${i * 0.06}s` }}>
              <div style={{ fontSize: '28px', marginBottom: '12px' }}>{f.icon}</div>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>{f.title}</div>
              <div style={{ color: 'var(--text2)', fontSize: '13px', lineHeight: 1.6 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ textAlign: 'center', padding: '4rem 1.5rem 6rem', position: 'relative', zIndex: 1 }}>
        <div className="card" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <h2 className="serif" style={{ fontSize: '28px', marginBottom: '0.75rem' }}>
            Hemen dene
          </h2>
          <p style={{ color: 'var(--text2)', marginBottom: '1.5rem', fontSize: '14px' }}>
            Kayıt ol, profilini oluştur, ilk testini al.
          </p>
          <Link href="/register" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
            Ücretsiz hesap oluştur
          </Link>
        </div>
      </section>
    </main>
  )
}
