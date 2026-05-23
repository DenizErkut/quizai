'use client'
import Link from 'next/link'

export default function TermsPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Yasal</div>
          <h1 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}>Kullanım Şartları</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Son güncelleme: Mayıs 2026</p>
        </div>

        {[
          {
            title: '1. Taraflar ve Kapsam',
            content: 'Bu Kullanım Şartları ("Şartlar"), Pratium platformunu ("Platform") kullanan bireyler ("Kullanıcı") ile Pratium ("Şirket") arasındaki ilişkiyi düzenler. Platforma erişim sağlayarak veya hesap oluşturarak bu Şartları kabul etmiş sayılırsınız. Şartları kabul etmiyorsanız platformu kullanmayınız.',
          },
          {
            title: '2. Hizmetin Tanımı',
            content: 'Pratium, yapay zeka destekli kişiselleştirilmiş test ve gelişim planı sunan bir eğitim teknolojisi platformudur. Platform kapsamında şu hizmetler sunulmaktadır:',
            list: [
              'Konu, zorluk ve sınıf seviyesine göre yapay zeka destekli soru üretimi',
              'Kişisel performans analizi ve gelişim planı oluşturma',
              'Günlük test ve streak sistemi',
              'Kullanıcılar arası sıralama (liderboard)',
              'Dosya yükleme ile özel içerik oluşturma (PDF, görsel, ses)',
            ],
          },
          {
            title: '3. Hesap Oluşturma ve Güvenlik',
            content: 'Platformu kullanmak için kayıt olmanız gerekmektedir. Kayıt sırasında verdiğiniz bilgilerin doğru ve güncel olmasından siz sorumlusunuz. Hesabınızın güvenliğini korumak sizin sorumluluğunuzdadır. Hesabınızın yetkisiz kullanımını fark ettiğinizde derhal info@pratium.com adresine bildirmeniz gerekmektedir. 18 yaşın altındaki kullanıcıların platforma ebeveyn veya yasal vasi onayı ile kayıt olması gerekmektedir.',
          },
          {
            title: '4. Kullanım Koşulları',
            content: 'Platformu kullanırken aşağıdaki kurallara uymayı kabul edersiniz:',
            list: [
              'Platformu yalnızca yasal amaçlar için kullanmak',
              'Başkalarının haklarını ihlal etmemek',
              'Platformun işleyişini bozmaya yönelik girişimlerde bulunmamak',
              'Otomatik araçlar (bot, scraper vb.) kullanmamak',
              'Başkalarının hesaplarına yetkisiz erişim sağlamamak',
              'Yanıltıcı veya yanlış bilgi paylaşmamak',
            ],
          },
          {
            title: '5. Abonelik ve Ödeme',
            content: 'Platform ücretsiz ve premium olmak üzere iki plan sunar. Ücretsiz planda aylık 10 test hakkı bulunmaktadır. Premium plan aylık ücrete tabidir ve sınırsız test hakkı sunar. Ödeme işlemleri güvenli ödeme altyapısı üzerinden gerçekleştirilir. Abonelik iptal edilmediği sürece otomatik olarak yenilenir. İptal işlemleri bir sonraki fatura döneminden önce yapılmalıdır. Tamamlanan ödemeler için iade yapılmamaktadır.',
          },
          {
            title: '6. Davet ve Referral Sistemi',
            content: 'Platforma yeni kullanıcı davet ederek ödül kazanabilirsiniz. Davet sistemi kapsamında 10 kişiyi davet eden kullanıcılara 1 yıl ücretsiz Premium üyelik verilmektedir. Pratium, program koşullarını önceden bildirmek kaydıyla değiştirme hakkını saklı tutar. Sahte veya tekrarlanan hesaplarla yapılan davetler geçersiz sayılır.',
          },
          {
            title: '7. Fikri Mülkiyet',
            content: 'Platform üzerindeki tüm içerik, tasarım, yazılım ve materyaller Pratium\'a aittir ve telif hakkı yasalarıyla korunmaktadır. Kullanıcılar platforma yükledikleri içeriklerin (PDF, ses, görsel vb.) telif haklarına sahip olduklarını veya kullanım izni aldıklarını beyan eder. Pratium, kullanıcı tarafından yüklenen içerikleri yalnızca hizmet sunumu amacıyla kullanır.',
          },
          {
            title: '8. Gizlilik',
            content: 'Kişisel verilerinizin işlenmesi, ayrı bir belge olarak yayımlanan Gizlilik Politikası ve KVKK Aydınlatma Metni kapsamında gerçekleştirilmektedir. Platforma kayıt olarak bu politikayı kabul etmiş sayılırsınız.',
          },
          {
            title: '9. Sorumluluk Sınırlaması',
            content: 'Pratium, platformun kesintisiz veya hatasız çalışacağını garanti etmez. Platform üzerinden sunulan yapay zeka destekli içerikler eğitim amaçlıdır; resmi sınav garantisi veya akademik danışmanlık niteliği taşımaz. Pratium, dolaylı, arızi veya sonuçsal zararlardan sorumlu tutulamaz.',
          },
          {
            title: '10. Hesap Askıya Alma ve Sonlandırma',
            content: 'Pratium, bu Şartları ihlal eden kullanıcıların hesaplarını önceden bildirim yapmaksızın askıya alma veya sonlandırma hakkını saklı tutar. Kullanıcılar istedikleri zaman hesaplarını kapatabilir. Hesap kapatma talebi için info@pratium.com adresine başvurulabilir.',
          },
          {
            title: '11. Değişiklikler',
            content: 'Pratium, bu Şartları zaman zaman güncelleyebilir. Önemli değişiklikler e-posta veya platform bildirimi yoluyla duyurulacaktır. Değişiklik sonrası platformu kullanmaya devam etmek, yeni Şartları kabul ettiğiniz anlamına gelir.',
          },
          {
            title: '12. Uygulanacak Hukuk ve Yetki',
            content: 'Bu Şartlar Türkiye Cumhuriyeti hukukuna tabidir. Uyuşmazlıklarda İzmir mahkemeleri ve icra daireleri yetkilidir.',
          },
          {
            title: '13. İletişim',
            content: 'Bu Şartlarla ilgili sorularınız için: info@pratium.com adresine yazabilirsiniz.',
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
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>© 2026 Pratium. Tüm hakları saklıdır.</p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
            <Link href="/privacy" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>Gizlilik Politikası</Link>
            <Link href="/" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>← Ana sayfaya dön</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
