'use client'
import Link from 'next/link'
import SiteFooter from '@/components/SiteFooter'

export default function AboutPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Kurumsal</div>
          <h1 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}>Hakkımızda</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Son güncelleme: Temmuz 2026</p>
        </div>

        {[
          {
            title: 'Pratium Nedir?',
            content: 'Pratium, K-12 seviyesindeki öğrenciler için yapay zeka destekli, kişiselleştirilmiş sorular üreten bir eğitim teknolojisi platformudur. Öğrencilerin sınıf seviyesine ve konuya özel hazırlanan sorularla çalışmalarını, öğretmenlerin sınıflarını dijital olarak yönetmesini ve velilerin çocuklarının gelişimini şeffaf biçimde takip etmesini sağlar.',
          },
          {
            title: 'Misyonumuz',
            content: 'Türkiye\'deki her öğrencinin, kendi seviyesine ve öğrenme hızına uygun, MEB müfredatına sadık kalan, erişilebilir bir dijital çalışma arkadaşına sahip olmasını sağlamak. Öğretmenlerin tekrarlayan işlerden kurtulup öğretmeye daha fazla zaman ayırabilmesini, velilerin de çocuklarının gelişimini net bir şekilde görebilmesini hedefliyoruz.',
          },
          {
            title: 'Kurumsal Bilgiler',
            content: 'Pratium, aşağıdaki tüzel kişilik tarafından işletilmektedir:',
            list: [
              'Ticaret Unvanı: Dumerk Elektronik Sanayi ve Ticaret Limited Şirketi',
              'Ticaret Sicil No: 206257-5 (İstanbul Ticaret Sicili Müdürlüğü)',
              'MERSİS No: 0314 1207 4570 0001',
              'Vergi Dairesi / No: Mecidiyeköy Vergi Dairesi — 314 120 7457',
              'Adres: Fulya Mahallesi, Büyükdere Caddesi, Osmanbey Apt. No:52, İç Kapı No:17, Şişli / İstanbul',
            ],
          },
          {
            title: 'İletişim',
            content: 'Sorularınız, geri bildirimleriniz veya iş birliği talepleriniz için bize aşağıdaki kanaldan ulaşabilirsiniz:',
            list: [
              'E-posta: info@pratium.com',
              'Web: pratium.com',
              'Instagram: @pratiumai',
            ],
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
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <Link href="/privacy" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Gizlilik Politikası</Link>
            <Link href="/" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>← Ana sayfaya dön</Link>
          </div>
        </div>
      </div>
    <SiteFooter />
    </main>
  )
}
