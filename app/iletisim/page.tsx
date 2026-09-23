'use client'
import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export default function ContactPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>İletişim</div>
          <h1 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}>İletişim</h1>
        </div>

        <div className="card" style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.75rem' }}>Veri Sorumlusu</h2>
          <p style={{ fontSize: '14px', lineHeight: 1.9, color: 'var(--text)' }}>
            Dumerk Elektronik Sanayi ve Ticaret Limited Şirketi (&ldquo;Pratium&rdquo;)<br />
            Ticaret Sicil No: 206257-5<br />
            MERSİS: 0314 1207 4570 0001<br />
            Adres: Şişli, İstanbul<br />
            İletişim: <a href="mailto:info@pratium.com.tr" style={{ color: 'var(--accent)', textDecoration: 'none' }}>info@pratium.com.tr</a><br />
            Telefon: <a href="tel:+905413969946" style={{ color: 'var(--accent)', textDecoration: 'none' }}>+90 541 396 99 46</a>
          </p>
        </div>

        <div style={{ textAlign: 'center', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>© 2026 Dumerk Elektronik Sanayi ve Ticaret Limited Şirketi. Tüm hakları saklıdır.</p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/hakkimizda" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Hakkımızda</Link>
            <Link href="/" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>← Ana sayfaya dön</Link>
          </div>
        </div>
      </div>
    <SiteFooter />
    </main>
  )
}
