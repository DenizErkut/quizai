'use client'
import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export default function DeliveryReturnPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Yasal</div>
          <h1 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}>Teslimat ve İade Şartları</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Son güncelleme: Temmuz 2026</p>
        </div>

        {[
          {
            title: '1. Hizmetin Niteliği',
            content: 'Pratium, fiziksel bir ürün değil, dijital ortamda sunulan bir abonelik hizmetidir (yapay zeka destekli soru üretimi, analiz, sesli okuma, canlı sınıf ve ilgili platform özellikleri). Bu nedenle kargo veya fiziksel teslimat söz konusu değildir.',
          },
          {
            title: '2. Teslimat (Erişimin Başlaması)',
            content: 'Ödemenizin başarıyla tamamlanmasının ardından, satın aldığınız plana ait özellikler hesabınızda anında ve otomatik olarak aktif hale gelir. Herhangi bir ek işlem veya bekleme süresi gerekmez. Teknik bir aksaklık nedeniyle erişiminizde gecikme yaşarsanız info@pratium.com adresinden bize ulaşabilirsiniz.',
          },
          {
            title: '3. Cayma Hakkı İstisnası',
            content: '6502 sayılı Tüketicinin Korunması Hakkında Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca; elektronik ortamda anında ifa edilen hizmetler ve tüketiciye anında teslim edilen gayrimaddi mallara ilişkin sözleşmelerde (m. 15/1-ğ) tüketicinin cayma hakkı bulunmamaktadır. Pratium premium/unlimited üyeliği satın alındığı anda hesabınızda aktif hale geldiğinden ve hizmet kullanımınıza açıldığından, ödemeyi onaylamanızla birlikte cayma hakkınızın kullanılamayacağını kabul etmiş olursunuz.',
          },
          {
            title: '4. İade Koşulları',
            content: 'Yukarıdaki istisna kapsamında, tamamlanmış ve kullanımı başlamış ödemeler için genel kural olarak iade yapılmamaktadır. Ancak aşağıdaki durumlarda değerlendirme yapılır:',
            list: [
              'Mükerrer (aynı işlem için birden fazla) tahsilat yapılmışsa',
              'Teknik bir hata nedeniyle satın alınan hizmete hiç erişim sağlanamamışsa',
              'Yürürlükteki tüketici mevzuatının açıkça iade gerektirdiği diğer istisnai durumlarda',
            ],
          },
          {
            title: '5. İade Talebi Nasıl Yapılır?',
            content: 'İade talebinizi, işlem tarihini ve ilgili hususu belirterek info@pratium.com adresine e-posta ile iletebilirsiniz. Talebiniz en geç 14 iş günü içinde değerlendirilip tarafınıza dönüş yapılır. Onaylanan iadeler, ödemenin yapıldığı kart/hesaba, ödeme altyapı sağlayıcımız (iyzico) üzerinden gerçekleştirilir.',
          },
          {
            title: '6. Abonelik İptali',
            content: 'Abonelik iptali, cari dönemin sonuna kadar hizmete erişiminizi etkilemez; iptal sonrası bir sonraki döneme yenileme yapılmaz. İptal işlemini hesap ayarlarınızdan veya info@pratium.com üzerinden talep ederek gerçekleştirebilirsiniz.',
          },
          {
            title: '7. İletişim',
            content: 'Teslimat ve iade süreçleriyle ilgili tüm sorularınız için: info@pratium.com',
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
            <Link href="/mesafeli-satis" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Mesafeli Satış Sözleşmesi</Link>
            <Link href="/" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>← Ana sayfaya dön</Link>
          </div>
        </div>
      </div>
    <SiteFooter />
    </main>
  )
}
