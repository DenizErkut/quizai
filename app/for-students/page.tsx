import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'Öğrenciler İçin | Pratium',
  description: 'Pratium, MEB müfredatına uygun, seviyene göre kendiliğinden zorlaşan/kolaylaşan yapay zeka destekli sorularla çalışmanı sağlar. İlkokuldan üniversiteye, sınırsız kişiselleştirilmiş test.',
}

const features = [
  {
    title: 'Sınırsız, Sana Özel Sorular',
    badge: 'accent',
    content: 'İstediğin konuda, MEB müfredatına uygun, daha önce hiç görmediğin sorular üretilir. Kendi konunu da yazabilir ya da ders notlarını/kitap sayfasını yükleyip ondan soru üretmesini isteyebilirsin.',
  },
  {
    title: 'Zorluk Seviyesini Sen Seçmiyorsun, Sistem Ayarlıyor',
    badge: 'blue',
    content: 'Bir testin ilk yarısındaki performansına göre, ikinci yarısının zorluğu otomatik ayarlanır — kolay soruları hep doğru yapıyorsan zorlaşır, zorlanıyorsan kolaylaşır. Aynı hatayı art arda yaparsan yeni bir soruya geçmeden önce kısa bir öğretici ara ekran seni bekler.',
  },
  {
    title: 'Yanlış Yaptığında Cevabı Direkt Söylemeyiz',
    badge: 'purple',
    content: 'Test bittikten sonra AI Asistan\'la konuşabilirsin. Önce seni düşündürür — neden o cevabı verdiğini sorar, ipucu verir, örnek gösterir — ve en son (istersen daha erken de) net açıklamayı yapar. Amaç, ezber değil gerçekten anlaman.',
  },
  {
    title: 'Kendi Kendine Güncellenen Çalışma Planın',
    badge: 'green',
    content: '4 haftalık kişisel bir çalışma planın otomatik oluşur — hangi konulara öncelik vermen gerektiğine sen değil, performansına bakan sistem karar verir. Plan her hafta, geçen haftanın sonucuna göre kendini günceller.',
  },
]

const otherModes = [
  { title: 'Canlı Quiz', desc: 'Öğretmeninin başlattığı canlı testlere gerçek zamanlı katıl.' },
  { title: 'Günlük Meydan Okuma', desc: 'Her gün yeni bir soru, seriyi (streak) bozmadan devam et.' },
  { title: 'Sıralama', desc: 'Arkadaşlarınla ya da sınıfınla karşılaştır.' },
  { title: 'Açık Uçlu Sorular', desc: 'MEB\'in ortak sınav formatında senaryo + soru + rubrik bazlı puanlama.' },
  { title: 'Sesli Kitap', desc: 'Ders kitaplarını dinleyerek çalış, uzun bölümlerde özet dinleme seçeneği var.' },
]

export default function ForStudentsPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-accent" style={{ marginBottom: '0.75rem' }}>Öğrenciler İçin</div>
          <h1 className="serif" style={{ fontSize: '30px', marginBottom: '0.75rem' }}>Kendi seviyene göre çalış, kendi hızında öğren</h1>
          <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.7 }}>
            İlkokuldan liseye, hatta üniversiteye kadar — Pratium, sana özel sorular üretir, seni takip eder ve
            neyi bilmediğini değil, neyi öğrenmen gerektiğini gösterir.
          </p>
        </div>

        {features.map((f, i) => (
          <div key={i} className="card" style={{ marginBottom: '1rem' }}>
            <div className={`badge badge-${f.badge}`} style={{ marginBottom: '0.6rem' }}>{f.title}</div>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text)' }}>{f.content}</p>
          </div>
        ))}

        <h2 className="serif" style={{ fontSize: '20px', marginTop: '2rem', marginBottom: '1rem' }}>Diğer Çalışma Modları</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
          {otherModes.map((m, i) => (
            <div key={i} className="card-sm">
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>{m.title}</h3>
              <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{m.desc}</p>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <a href="https://pratium.com/register" className="btn btn-primary">Ücretsiz Başla →</a>
        </div>

        <div style={{ textAlign: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/for-parents" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Veliler için →</Link>
            <Link href="/for-teachers" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Öğretmenler için →</Link>
            <Link href="/methodology" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Metodolojimiz →</Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
