'use client'
import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        <div style={{ marginBottom: '2rem' }}>
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
          </Link>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Yasal</div>
          <h1 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}>Gizlilik Politikası ve KVKK Aydınlatma Metni</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px' }}>Son güncelleme: Mayıs 2026</p>
        </div>

        {[
          {
            title: '1. Veri Sorumlusu',
            content: 'Bu aydınlatma metni, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında Pratium (pratium.com) tarafından hazırlanmıştır. Kişisel verileriniz, veri sorumlusu sıfatıyla Pratium tarafından işlenmektedir.',
          },
          {
            title: '2. Toplanan Kişisel Veriler',
            content: '',
            list: [
              'Kimlik bilgileri: Ad, soyad',
              'İletişim bilgileri: E-posta adresi, telefon numarası (opsiyonel)',
              'Demografik bilgiler: Yaş, sınıf/eğitim seviyesi',
              'Sosyal medya hesapları: Instagram, TikTok kullanıcı adı (opsiyonel)',
              'Kullanım verileri: Test sonuçları, çözülen sorular, başarı oranları, streak bilgisi',
              'Teknik veriler: IP adresi, tarayıcı bilgisi, oturum verileri',
            ],
          },
          {
            title: '3. Kişisel Verilerin İşlenme Amaçları',
            content: '',
            list: [
              'Platforma kayıt ve kimlik doğrulama işlemlerinin gerçekleştirilmesi',
              'Kişiselleştirilmiş test ve gelişim planı oluşturulması',
              'Performans analizi ve gelişim takibi',
              'Liderboard ve sıralama sisteminin işletilmesi',
              'Kullanıcı desteği sağlanması',
              'Platform güvenliğinin sağlanması',
              'Yasal yükümlülüklerin yerine getirilmesi',
            ],
          },
          {
            title: '4. Kişisel Verilerin İşlenme Hukuki Dayanağı',
            content: 'Kişisel verileriniz; KVKK\'nın 5. maddesi uyarınca açık rızanız, sözleşmenin ifası ve meşru menfaat kapsamında işlenmektedir.',
          },
          {
            title: '5. Kişisel Verilerin Aktarılması',
            content: 'Kişisel verileriniz; altyapı hizmetleri için Supabase (veri tabanı ve kimlik doğrulama), yapay zeka hizmetleri için Anthropic ve ödeme işlemleri için ilgili ödeme kuruluşlarıyla paylaşılabilir. Bu aktarımlar, KVKK\'nın 8. ve 9. maddeleri kapsamında gerçekleştirilmektedir.',
          },
          {
            title: '6. Kişisel Verilerin Saklanma Süresi',
            content: 'Kişisel verileriniz, hesabınızın aktif olduğu süre boyunca ve hesabın silinmesinden itibaren yasal saklama yükümlülükleri kapsamında en fazla 3 yıl süreyle saklanmaktadır.',
          },
          {
            title: '7. KVKK Kapsamındaki Haklarınız',
            content: 'KVKK\'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:',
            list: [
              'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
              'İşlenmişse buna ilişkin bilgi talep etme',
              'İşlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme',
              'Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme',
              'Eksik veya yanlış işlenmişse düzeltilmesini isteme',
              'Verilerinizin silinmesini veya yok edilmesini talep etme',
              'İşlemenin otomatik sistemler aracılığıyla yapılması halinde ortaya çıkan aleyhte sonuca itiraz etme',
              'Kanuna aykırı işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme',
            ],
          },
          {
            title: '8. Çerez (Cookie) Politikası',
            content: 'Pratium, platform işlevselliği için zorunlu oturum çerezleri kullanmaktadır. Üçüncü taraf izleme veya reklam çerezleri kullanılmamaktadır.',
          },
          {
            title: '9. Veri Güvenliği',
            content: 'Kişisel verileriniz, endüstri standardı güvenlik önlemleriyle (SSL/TLS şifrelemesi, güvenli veritabanı) korunmaktadır. Supabase altyapısı üzerinde depolanan verileriniz şifrelenmiş biçimde saklanmaktadır.',
          },
          {
            title: '10. Hesap ve Veri Silme',
            content: 'Hesabınızı ve tüm kişisel verilerinizi silmek için info@pratium.com adresine e-posta gönderebilirsiniz. Talebiniz 30 gün içinde işleme alınacaktır.',
          },
          {
            title: '11. İletişim',
            content: 'KVKK kapsamındaki talepleriniz ve gizlilik ile ilgili sorularınız için: info@pratium.com adresine yazabilirsiniz.',
          },
        ].map((section, i) => (
          <div key={i} className="card" style={{ marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent)', marginBottom: '0.75rem' }}>{section.title}</h2>
            {section.content && <p style={{ fontSize: '14px', lineHeight: 1.8, color: 'var(--text)', marginBottom: section.list ? '0.75rem' : 0 }}>{section.content}</p>}
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
          <p style={{ fontSize: '12px', color: 'var(--text3)' }}>© 2026 Pratium. Tüm hakları saklıdır.</p>
          <Link href="/" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>← Ana sayfaya dön</Link>
        </div>
      </div>
    </main>
  )
}
