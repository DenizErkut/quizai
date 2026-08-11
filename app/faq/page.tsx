import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'Sık Sorulan Sorular | Pratium',
  description: 'Pratium hakkında en çok sorulan sorular — fiyatlandırma, veri güvenliği, hangi sınıflar için uygun olduğu ve daha fazlası.',
}

const faqs = [
  {
    q: 'Pratium nedir?',
    a: 'Pratium, MEB müfredatına uygun, yapay zeka destekli sorular üreten bir K-12 sınav hazırlık ve gelişim takip platformudur. Öğrenci, öğretmen ve veli için ayrı paneller sunar.',
  },
  {
    q: 'Hangi sınıf seviyeleri için uygun?',
    a: 'İlkokul (1-4. sınıf), ortaokul (5-8. sınıf) ve lise (9-12. sınıf) öğrencileri için MEB müfredatına uygun içerik üretilir. Üniversite öğrencileri de kendi bölümlerine uygun genel akademik sorular üretebilir.',
  },
  {
    q: 'Pratium ücretsiz mi?',
    a: 'Ücretsiz bir başlangıç planı vardır. Sınırsız test ve gelişmiş özellikler için Premium (aylık veya yıllık) ve Unlimited planları bulunur.',
  },
  {
    q: 'Sorular nasıl üretiliyor, güvenilir mi?',
    a: 'Sorular gerçek MEB kaynak metinlerinden (ders kitabı içeriği, kazanımlar) beslenerek üretilir. Bir yapay zeka modeli soruyu üretir, ayrı ve bağımsız bir model (özellikle matematikte) sonucu çapraz kontrol eder, üçüncü bir model genel kalite denetimi yapar.',
  },
  {
    q: 'Veli olarak çocuğumu nasıl takip ederim?',
    a: 'Çocuğunuzun hesabından alacağınız bağlantı kodunu veli kaydı sırasında girerek bağlanabilirsiniz. Bağlandıktan sonra haftalık otomatik özet e-postaları ve gerektiğinde anlık risk uyarıları alırsınız.',
  },
  {
    q: 'Öğretmen olarak nasıl kayıt olurum?',
    a: 'Kayıt sırasında "Öğretmen" rolünü seçip başvurabilirsiniz. Kurumunuz (okul/dershane) Pratium ile anlaşmalıysa, kurum yöneticiniz sizi doğrudan sınıflarınızla ekleyebilir.',
  },
  {
    q: 'Verilerim (KVKK açısından) güvende mi?',
    a: 'Evet. Öğrenci kimlik bilgileri (ad, yaş gibi) ile akademik/test performansı verisi ayrı sistemlerde tutulur. Her kullanıcı yalnızca kendi yetkisi olan veriyi görebilir — bir öğretmen sadece kendi sınıfını, bir veli sadece kendi çocuğunu görür.',
  },
  {
    q: 'Kendi ders notlarımdan/kitabımdan soru ürettirebilir miyim?',
    a: 'Evet. Konu yazmanın yanı sıra, ders notu ya da kitap sayfası (PDF, görsel, metin) yükleyip o içerikten soru üretilmesini isteyebilirsiniz.',
  },
]

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map(f => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
}

export default function FaqPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-yellow" style={{ marginBottom: '0.75rem' }}>Sık Sorulan Sorular</div>
          <h1 className="serif" style={{ fontSize: '30px', marginBottom: '0.75rem' }}>Merak ettikleriniz</h1>
        </div>

        {faqs.map((f, i) => (
          <details key={i} className="card" style={{ marginBottom: '0.75rem', cursor: 'pointer' }}>
            <summary style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', listStyle: 'none' }}>
              {f.q}
            </summary>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text2)', marginTop: '0.75rem' }}>
              {f.a}
            </p>
          </details>
        ))}

        <div style={{ textAlign: 'center', marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '10px' }}>Sorunuz burada yok mu?</p>
          <a href="mailto:info@pratium.com.tr" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Bize ulaşın →</a>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
