import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'Metodolojimiz | Pratium',
  description: 'Pratium\'un yapay zeka soru üretimi, 3 katmanlı doğrulama, adaptif zorluk ayarı ve Sokratik öğretim yaklaşımı nasıl çalışır — teknik ve pedagojik yaklaşımımız.',
}

const sections = [
  {
    title: '3 Katmanlı Yapay Zeka Doğrulama',
    badge: 'accent',
    content: 'Sorularınız tek bir yapay zeka modeli tarafından üretilip kontrolsüz sunulmaz. Bir model soruyu üretir, ikinci ve bağımsız bir model (özellikle matematik sorularında) sonucu çapraz kontrol eder, üçüncü bir model genel kalite denetimi yapar. Bu, hatalı ya da yanıltıcı bir sorunun öğrenciye ulaşma riskini azaltır.',
  },
  {
    title: 'MEB Müfredatına Sadakat',
    badge: 'blue',
    content: 'Sorular, ilgili sınıf ve konu için gerçek MEB kaynak metinlerinden (ders kitabı içeriği, kazanımlar) beslenerek üretilir — genel/rastgele bir "sınav hazırlık" içeriği değil, o dönem gerçekten işlenen müfredata sadık kalınır.',
  },
  {
    title: 'Otomatik Zorluk Ayarı (Adaptif Test)',
    badge: 'purple',
    content: 'Öğrenciye zorluk seviyesi sorulmaz. Sistem, o öğrencinin ilgili konudaki geçmiş performansına bakarak başlangıç zorluğunu belirler; test sırasında da performansa göre zorluk kendiliğinden ayarlanır. Aynı hata tekrarlanırsa, yeni bir soruya geçmeden önce kısa bir öğretici ara adım devreye girer.',
  },
  {
    title: 'Sokratik Öğretim Yaklaşımı',
    badge: 'green',
    content: 'AI Asistan, yanlış yapılan bir sorunun cevabını doğrudan söylemez. Önce öğrenciyi kendi düşünmeye teşvik eder, gerekirse ipucu verir, örnek gösterir ve en sonunda net bir açıklama yapar. Öğrenci açıkça doğrudan cevap isterse buna da saygı gösterilir.',
  },
  {
    title: 'Sürekli Ölçüm ve Değerlendirme Döngüsü',
    badge: 'red',
    content: 'Bir öneri ya da çalışma planı üretildikten sonra sistem orada durmaz — bir sonraki değerlendirmede, önceki hedeflenen konularda gerçekten ilerleme olup olmadığı ölçülür ve bu sonuç, yeni planın kendisine geri beslenir.',
  },
]

export default function MethodologyPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Metodoloji</div>
          <h1 className="serif" style={{ fontSize: '30px', marginBottom: '0.75rem' }}>Pratium nasıl çalışır?</h1>
          <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.7 }}>
            Pratium'un yapay zeka soru üretiminden pedagojik yaklaşımına kadar temel çalışma prensipleri.
          </p>
        </div>

        {sections.map((s, i) => (
          <div key={i} className="card" style={{ marginBottom: '1rem' }}>
            <div className={`badge badge-${s.badge}`} style={{ marginBottom: '0.6rem' }}>{s.title}</div>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text)' }}>{s.content}</p>
          </div>
        ))}

        <div style={{ textAlign: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)', marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/for-students" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Öğrenciler için →</Link>
            <Link href="/faq" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Sık Sorulan Sorular →</Link>
            <Link href="/hakkimizda" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Hakkımızda →</Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
