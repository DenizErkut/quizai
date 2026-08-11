import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'Öğretmenler İçin | Pratium',
  description: 'Sınıfınızın hangi öğrencisinin desteğe ihtiyacı olduğunu risk gruplamasıyla görün, ödev atayın, not içe aktarın ve yapay zeka destekli sınıf analizleri alın.',
}

const features = [
  {
    title: 'Sınıfınızın Risk Dağılımını Görün',
    badge: 'red',
    content: 'Sınıfınızdaki her öğrenci, performansına göre otomatik olarak Riskli / Geliştirilmeli / Yeterli şeklinde gruplanır — kimin öncelikli desteğe ihtiyacı olduğunu tek bakışta görürsünüz. Bir öğrencinin tek bir konuda bile ciddi zorlanması, diğer konulardaki iyi performansın arasında kaybolmaz.',
  },
  {
    title: 'Yapay Zeka Destekli Sınıf Analizi',
    badge: 'purple',
    content: 'Sınıfınızın risk dağılımına ve en sık zorlanılan konulara bakan bir analiz, hangi konuyu tekrar işlemenizin faydalı olacağına dair somut bir öneri sunar.',
  },
  {
    title: 'Ödev Atama ve Takip',
    badge: 'accent',
    content: 'Sınıfınıza ya da belirli öğrencilere test veya açık uçlu soru ödevi atayabilir, tamamlanma durumunu ve sonuçlarını takip edebilirsiniz.',
  },
  {
    title: 'Not İçe Aktarma',
    badge: 'blue',
    content: 'Mevcut not tablonuzu (Excel şablonuyla) içe aktarıp öğrenci profilleriyle eşleştirebilirsiniz.',
  },
  {
    title: 'Açık Uçlu Soru Oluşturma',
    badge: 'green',
    content: 'MEB\'in ortak sınav formatına uygun (senaryo + soru + rubrik) açık uçlu sorular, yapay zeka ile ya da kendi yazımınızla oluşturup sınıfınıza ödev olarak atayabilirsiniz.',
  },
]

export default function ForTeachersPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-blue" style={{ marginBottom: '0.75rem' }}>Öğretmenler İçin</div>
          <h1 className="serif" style={{ fontSize: '30px', marginBottom: '0.75rem' }}>Hangi öğrenciye önce zaman ayırmanız gerektiğini bilin</h1>
          <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.7 }}>
            Pratium, sınıfınızın genel durumunu ve bireysel risk noktalarını görünür kılarak, öğretme zamanınızı
            en çok ihtiyacı olan yere yönlendirmenize yardımcı olur.
          </p>
        </div>

        {features.map((f, i) => (
          <div key={i} className="card" style={{ marginBottom: '1rem' }}>
            <div className={`badge badge-${f.badge}`} style={{ marginBottom: '0.6rem' }}>{f.title}</div>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text)' }}>{f.content}</p>
          </div>
        ))}

        <div className="card" style={{ marginBottom: '2rem', background: 'var(--bg2)' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '0.6rem' }}>Kurumunuz İçin</h2>
          <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text2)' }}>
            Okulunuz veya dershaneniz Pratium ile kurumsal olarak çalışıyorsa, kurum yöneticiniz sizi
            sınıflarınızla birlikte sisteme ekleyebilir. Bireysel öğretmen başvurusu için kayıt sırasında
            "Öğretmen" rolünü seçmeniz yeterli — başvurunuz kurum yöneticisi tarafından onaylanır.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <a href="https://pratium.com/register" className="btn btn-primary">Öğretmen Olarak Başvur →</a>
        </div>

        <div style={{ textAlign: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/for-students" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Öğrenciler için →</Link>
            <Link href="/for-parents" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Veliler için →</Link>
            <Link href="/ozel-kocluk" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Özel Koçluk →</Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
