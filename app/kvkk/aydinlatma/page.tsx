// app/kvkk/aydinlatma/page.tsx
export const metadata = { title: 'KVKK Aydınlatma Metni — Pratium' }

export default function AydinlatmaPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1rem 5rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>
          Kişisel Verilerin Korunması Aydınlatma Metni
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '1.5rem' }}>
          6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") m.10 uyarınca — Son güncelleme: [TARİH]
        </p>

        <Section title="1. Veri Sorumlusu">
          Bu aydınlatma metni, [ŞİRKET UNVANI] ("Pratium") tarafından veri sorumlusu sıfatıyla hazırlanmıştır.
          Adres: [ADRES] · E-posta: kvkk@pratium.com · MERSİS: [NO]
        </Section>

        <Section title="2. İşlenen Kişisel Veriler">
          <ul style={ul}>
            <li><b>Kimlik:</b> ad, soyad, yaş, sınıf düzeyi</li>
            <li><b>İletişim:</b> e-posta adresi</li>
            <li><b>Eğitim Performansı:</b> quiz sonuçları, doğru/yanlış cevaplar, konu bazlı başarı analizi, çalışma süresi, seri (streak) bilgisi</li>
            <li><b>İşlem Güvenliği:</b> IP adresi, oturum kayıtları, cihaz/tarayıcı bilgisi</li>
            <li><b>Veli/Kurum Bağlantısı:</b> veli bağlantı kodu, kurum üyelik bilgisi</li>
          </ul>
        </Section>

        <Section title="3. İşleme Amaçları ve Hukuki Sebepler">
          <ul style={ul}>
            <li>Üyelik sözleşmesinin kurulması ve ifası (KVKK m.5/2-c): hesap oluşturma, quiz hizmeti sunma</li>
            <li>Hukuki yükümlülüklerin yerine getirilmesi (m.5/2-ç): mevzuat gereği kayıt tutma</li>
            <li>Meşru menfaat (m.5/2-f): hizmet güvenliği, hata tespiti, dolandırıcılık önleme</li>
            <li>Açık rıza (m.5/1): performans verilerinin AI destekli analiz için işlenmesi, veli raporlaması, pazarlama iletişimi (ayrı açık rıza metinleri ile alınır)</li>
          </ul>
        </Section>

        <Section title="4. Çocuklara İlişkin Veriler">
          Platform 18 yaş altı öğrencilere hizmet vermektedir. Ergin olmayan kullanıcıların kişisel verilerinin
          işlenmesi, veli/vasi bilgilendirmesi ve gerekli hallerde veli açık rızası çerçevesinde yürütülür.
          Veli, Veli Paneli üzerinden çocuğunun verilerine erişebilir, düzeltme ve silme talep edebilir.
        </Section>

        <Section title="5. Verilerin Aktarılması">
          Kişisel verileriniz; barındırma, e-posta ve yapay zeka analiz hizmetleri kapsamında,
          KVKK m.9'daki güvencelere uygun olarak yurt dışında yerleşik hizmet sağlayıcılara aktarılabilmektedir.
          <b> Yapay zeka servislerine gönderilen içeriklerde kimlik bilgileriniz (ad, e-posta, kullanıcı kimliği)
          yer almaz; yalnızca anonimleştirilmiş soru/cevap içeriği iletilir.</b> Aktarım yapılan hizmet
          sağlayıcılar ve güvence mekanizmaları hakkında detaylı bilgi için kvkk@pratium.com adresine başvurabilirsiniz.
        </Section>

        <Section title="6. Saklama Süreleri">
          Veriler, üyelik süresince ve üyelik sona erdikten sonra ilgili mevzuatta öngörülen zamanaşımı
          süreleri boyunca saklanır; süre sonunda Kişisel Veri Saklama ve İmha Politikamız uyarınca silinir,
          yok edilir veya anonim hale getirilir. Hesabınızı sildiğinizde verileriniz [30] gün içinde imha edilir.
        </Section>

        <Section title="7. KVKK m.11 Kapsamındaki Haklarınız">
          Kişisel verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, düzeltme, silinmesini isteme,
          aktarıldığı üçüncü kişileri bilme, zarara uğramanız hâlinde tazminat talep etme haklarına sahipsiniz.
          Başvurularınızı <b>Profil &gt; KVKK Talepleri</b> sayfasından veya kvkk@pratium.com adresine iletebilirsiniz.
          Başvurular en geç 30 gün içinde yanıtlanır.
        </Section>
      </div>
    </main>
  )
}

const ul: React.CSSProperties = { fontSize: '13px', lineHeight: 1.8, color: 'var(--text2)', paddingLeft: '1.2rem' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>{title}</h2>
      <div style={{ fontSize: '13px', lineHeight: 1.7, color: 'var(--text2)' }}>{children}</div>
    </div>
  )
}
