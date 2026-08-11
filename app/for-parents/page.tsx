import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export const metadata = {
  title: 'Veliler İçin | Pratium',
  description: 'Çocuğunuzun akademik gelişimini haftalık otomatik özetlerle ve bir konu risk oluşturduğunda anlık bildirimlerle takip edin. KVKK uyumlu, kimlik verisi ayrı saklanır.',
}

const features = [
  {
    title: 'Haftalık Otomatik Özet',
    badge: 'accent',
    content: 'Her pazar sabahı, çocuğunuzun o haftaki test sayısı, ortalama başarısı ve en çok zorlandığı konu e-posta ile size ulaşır — sisteme hiç girmenize gerek kalmadan. Özete, o hafta neye odaklanmanızın faydalı olacağına dair somut bir öneri de eklenir.',
  },
  {
    title: 'Bir Konu Riskli Hale Gelirse Hemen Haber Veririz',
    badge: 'red',
    content: 'Haftalık özeti beklemenize gerek yok — çocuğunuzun bir konudaki performansı ciddi şekilde düşerse, o an size ayrı bir uyarı e-postası gider. Aynı konu için tekrar tekrar bildirim göndermeyiz; durum toparlanıp yeniden geriler ise ancak o zaman tekrar haber veririz.',
  },
  {
    title: 'Gelişimi Tek Ekrandan Görün',
    badge: 'blue',
    content: 'Veli panelinden çocuğunuzun test geçmişini, konu bazlı başarısını ve genel eğilimini istediğiniz an inceleyebilirsiniz.',
  },
  {
    title: 'Verileriniz Güvende',
    badge: 'green',
    content: 'Çocuğunuzun kimlik bilgileri (ad, yaş gibi) ile test performansı verisi KVKK gereği ayrı sistemlerde tutulur. Bir öğretmen ya da veli, yalnızca kendi yetkisi olan öğrenciye ait veriyi görebilir.',
  },
]

export default function ForParentsPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Veliler İçin</div>
          <h1 className="serif" style={{ fontSize: '30px', marginBottom: '0.75rem' }}>Sisteme her gün girmenize gerek yok, biz size haber veririz</h1>
          <p style={{ color: 'var(--text2)', fontSize: '15px', lineHeight: 1.7 }}>
            Pratium, çocuğunuzun akademik durumunu takip etmenizi kolaylaştırır — hem düzenli, otomatik
            özetlerle hem de gerektiğinde anlık uyarılarla.
          </p>
        </div>

        {features.map((f, i) => (
          <div key={i} className="card" style={{ marginBottom: '1rem' }}>
            <div className={`badge badge-${f.badge}`} style={{ marginBottom: '0.6rem' }}>{f.title}</div>
            <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text)' }}>{f.content}</p>
          </div>
        ))}

        <div className="card" style={{ marginBottom: '2rem', background: 'var(--bg2)' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '0.6rem' }}>Nasıl Bağlanırım?</h2>
          <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text2)' }}>
            Çocuğunuzun hesabından size verilecek bağlantı kodunu veli kaydı sırasında girmeniz yeterli.
            Kurumunuz (okul/dershane) Pratium ile anlaşmalıysa, bazı adımlar otomatik tamamlanabilir.
          </p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <a href="https://pratium.com/register" className="btn btn-primary">Veli Hesabı Oluştur →</a>
        </div>

        <div style={{ textAlign: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/for-students" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Öğrenciler için →</Link>
            <Link href="/for-teachers" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Öğretmenler için →</Link>
            <Link href="/faq" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Sık Sorulan Sorular →</Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </main>
  )
}
