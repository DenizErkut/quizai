import Link from 'next/link'

// iyzico web sitesi kriterleri: Teslimat/İade linki + ödeme logoları (resmi
// iyzico logo paketi, koyu zemin için White varyant) tüm herkese açık
// sayfalarda görünsün diye ortak footer. TEK kaynak — bazı sayfalar
// (özellikle anasayfa) daha önce bunu kopyalayıp kendi footer'ını
// yazmıştı, zamanla bu kopyalar birbirinden sapmıştı (ör. anasayfada
// "Özel Koçluk" linki eksikti). Artık tüm herkese açık sayfalar bu TEK
// bileşeni kullanmalı.
export default function SiteFooter() {
  const links = [
    { href: '/hakkimizda', label: 'Hakkımızda' },
    { href: '/for-students', label: 'Öğrenciler İçin' },
    { href: '/for-parents', label: 'Veliler İçin' },
    { href: '/for-teachers', label: 'Öğretmenler İçin' },
    { href: '/methodology', label: 'Metodoloji' },
    { href: '/faq', label: 'Sık Sorulan Sorular' },
    { href: '/ozel-kocluk', label: 'Özel Koçluk' },
    { href: '/pricing', label: 'Planlar' },
    { href: '/privacy', label: 'Gizlilik' },
    { href: '/cookie-policy', label: 'Çerez Politikası' },
    { href: '/terms', label: 'Kullanım Şartları' },
    { href: '/mesafeli-satis', label: 'Mesafeli Satış Sözleşmesi' },
    { href: '/teslimat-iade', label: 'Teslimat ve İade' },
  ]
  return (
    <footer style={{ background: '#203a32', padding: '3rem 1.5rem 2rem', marginTop: '3rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <Link href="/">
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '48px', filter: 'brightness(0) invert(1)' }} />
          </Link>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px 20px' }}>
            {links.map(l => (
              <Link key={l.href} href={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <img
            src="/payment/iyzico-band-white.svg"
            alt="iyzico ile öde — Mastercard, Visa, American Express, Troy"
            style={{ height: '30px', maxWidth: '100%' }}
          />
          <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)' }}>
            © 2026 Dumerk Elektronik Sanayi ve Ticaret Limited Şirketi
          </p>
        </div>
      </div>
    </footer>
  )
}
