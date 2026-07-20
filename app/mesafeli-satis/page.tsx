'use client'
import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export default function DistanceSalesPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Yasal</div>
          <h1 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}>Mesafeli Satış Sözleşmesi</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Son güncelleme: Temmuz 2026</p>
        </div>

        <div className="card" style={{ marginBottom: '1rem', background: 'rgba(30,207,184,0.06)', border: '1px solid rgba(30,207,184,0.2)' }}>
          <p style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text)' }}>
            Bu sayfa, Pratium üzerinden yapılan ücretli abonelik satın alımlarında taraflar arasında kurulan Mesafeli Satış Sözleşmesi'nin genel şartlarını içerir. Her satın alma işleminde, işbu sözleşmenin işlem bilgilerinizle (plan, tutar, tarih) tamamlanmış hali ödeme adımında onayınıza sunulur.
          </p>
        </div>

        {[
          {
            title: 'Madde 1 — Taraflar',
            content: '',
            list: [
              'SATICI: Dumerk Elektronik Sanayi ve Ticaret Limited Şirketi — Fulya Mahallesi, Büyükdere Caddesi, Osmanbey Apt. No:52, İç Kapı No:17, Şişli / İstanbul — Ticaret Sicil No: 206257-5 — MERSİS No: 0314 1207 4570 0001 — E-posta: info@pratium.com',
              'ALICI: Pratium platformu üzerinden üyelik satın alan, işlem sırasında kimlik ve iletişim bilgilerini beyan eden gerçek/tüzel kişi ("Kullanıcı").',
            ],
          },
          {
            title: 'Madde 2 — Sözleşmenin Konusu',
            content: 'İşbu sözleşmenin konusu, ALICI\'nın SATICI\'ya ait pratium.com platformu üzerinden elektronik ortamda satın aldığı dijital abonelik hizmetinin (Premium/Unlimited üyelik) satışı ve ifasına ilişkin olarak, 6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği hükümleri uyarınca tarafların hak ve yükümlülüklerinin belirlenmesidir.',
          },
          {
            title: 'Madde 3 — Sözleşme Konusu Hizmet Bilgileri',
            content: 'Hizmetin temel özellikleri (plan adı, kapsamı, süresi, ücreti ve ödeme şekli) satın alma anında ödeme sayfasında ALICI\'ya açıkça gösterilir ve ALICI bu bilgileri onaylayarak satın alma işlemini tamamlar. Güncel plan ve fiyat bilgileri her zaman pratium.com/pricing adresinde yer alır.',
          },
          {
            title: 'Madde 4 — Ödeme',
            content: 'Ödemeler, SATICI\'nın anlaşmalı olduğu ödeme kuruluşu iyzico altyapısı üzerinden, kredi/banka kartı ile güvenli şekilde tahsil edilir. Kart bilgileri SATICI sunucularında saklanmaz.',
          },
          {
            title: 'Madde 5 — İfa (Teslimat)',
            content: 'Hizmet, ödemenin onaylanmasının hemen ardından elektronik ortamda, ALICI\'nın Pratium hesabına tanımlanarak ifa edilir. Detaylar için ayrıca yayımlanan Teslimat ve İade Şartları sayfasına bakınız.',
          },
          {
            title: 'Madde 6 — Cayma Hakkı',
            content: 'Mesafeli Sözleşmeler Yönetmeliği m. 15/1-ğ uyarınca, elektronik ortamda anında ifa edilen hizmetlere ve ALICI\'ya anında teslim edilen gayrimaddi mallara ilişkin sözleşmelerde cayma hakkı bulunmamaktadır. ALICI, satın alma işlemini onaylayarak hizmetin anında ifa edileceğini ve bu kapsamda cayma hakkının bulunmadığını kabul eder. Detaylar için Teslimat ve İade Şartları sayfasına bakınız.',
          },
          {
            title: 'Madde 7 — Genel Hükümler',
            content: 'ALICI, satın alma işlemini tamamlamadan önce sözleşme konusu hizmetin temel nitelikleri, satış fiyatı, ödeme şekli ve ifa koşulları hakkında SATICI tarafından bilgilendirildiğini, bu ön bilgileri elektronik ortamda teyit ettiğini ve işbu sözleşmeyi elektronik ortamda onayladığını kabul eder.',
          },
          {
            title: 'Madde 8 — Uyuşmazlıkların Çözümü',
            content: 'İşbu sözleşmeden doğan uyuşmazlıklarda, Ticaret Bakanlığı\'nca her yıl belirlenen parasal sınırlar dahilinde ALICI\'nın veya SATICI\'nın yerleşim yerindeki Tüketici Hakem Heyetleri ile Tüketici Mahkemeleri yetkilidir.',
          },
        ].map((section, i) => (
          <div key={i} className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.75rem' }}>{section.title}</h2>
            {section.content && (
              <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text)', marginBottom: section.list ? '0.75rem' : 0 }}>
                {section.content}
              </p>
            )}
            {section.list && (
              <ul style={{ paddingLeft: '1.25rem', margin: 0 }}>
                {section.list.map((item, j) => (
                  <li key={j} style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text)', marginBottom: '4px' }}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        ))}

        <div style={{ textAlign: 'center', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>© 2026 Dumerk Elektronik Sanayi ve Ticaret Limited Şirketi. Tüm hakları saklıdır.</p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/teslimat-iade" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Teslimat ve İade Şartları</Link>
            <Link href="/" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>← Ana sayfaya dön</Link>
          </div>
        </div>
      </div>
    <SiteFooter />
    </main>
  )
}
