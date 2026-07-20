import Link from 'next/link'

// iyzico web sitesi kriterleri: Teslimat/İade linki + ödeme logoları (resmi
// iyzico logo paketi, koyu zemin için White varyant) tüm herkese açık
// sayfalarda görünsün diye ortak footer.
export default function SiteFooter() {
  const links = [
    { href: '/hakkimizda', label: 'Hakkımızda' },
    { href: '/privacy', label: 'Gizlilik' },
    { href: '/terms', label: 'Kullanım Şartları' },
    { href: '/mesafeli-satis', label: 'Mesafeli Satış Sözleşmesi' },
    { href: '/teslimat-iade', label: 'Teslimat ve İade' },
    { href: '/pricing', label: 'Planlar' },
  ]
  return (
    <footer style={{ background: '#082465', padding: '2rem 1.5rem', marginTop: '3rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px 22px', marginBottom: '1.25rem' }}>
          {links.map(l => (
            <Link key={l.href} href={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>
              {l.label}
            </Link>
          ))}
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
