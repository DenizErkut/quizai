// app/kvkk/acik-riza/page.tsx
export const metadata = { title: 'Açık Rıza Metni — Pratium' }

export default function AcikRizaPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1rem 5rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>
          Açık Rıza Metni
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '1.5rem' }}>
          KVKK m.5/1 uyarınca — Bu metin Aydınlatma Metni'nden ayrı bir belgedir (Kurul İlke Kararı 2026/347).
        </p>

        <div style={{ fontSize: '13px', lineHeight: 1.8, color: 'var(--text2)' }}>
          <p style={{ marginBottom: '1rem' }}>
            [ŞİRKET UNVANI] ("Pratium") tarafından, <a href="/kvkk/aydinlatma" style={{ color: 'var(--accent)' }}>KVKK
            Aydınlatma Metni</a>'nde detaylı olarak açıklanan kapsamda bilgilendirilmiş olarak;
          </p>

          <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
            <b>1. Yapay Zeka Destekli Analiz Rızası</b>
            <p style={{ marginTop: '6px' }}>
              Quiz sonuçlarımın, cevaplarımın ve öğrenme performansı verilerimin; kişiselleştirilmiş soru üretimi,
              zayıf konu analizi, gelişim planı oluşturma ve aralıklı tekrar planlaması amacıyla yapay zeka
              sistemleri aracılığıyla işlenmesine açık rıza veriyorum. Bu işleme sırasında kimlik bilgilerimin
              (ad, e-posta, kullanıcı kimliği) yapay zeka servislerine iletilmediği konusunda bilgilendirildim.
            </p>
          </div>

          <div style={{ padding: '14px 16px', borderRadius: '12px', background: 'var(--bg2)', border: '1px solid var(--border)', marginBottom: '1rem' }}>
            <b>2. Veli Raporlama Rızası (18 yaş altı için)</b>
            <p style={{ marginTop: '6px' }}>
              Performans verilerimin haftalık raporlar halinde bağlantılı veli hesabına iletilmesine
              açık rıza veriyorum.
            </p>
          </div>

          <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
            Bu rızayı dilediğim zaman Profil &gt; KVKK Talepleri sayfasından geri çekebilirim. Rızanın geri
            çekilmesi, geri çekme öncesi yapılan işlemlerin hukuka uygunluğunu etkilemez. Rıza vermemem
            hâlinde platformun yapay zeka destekli özelliklerinden yararlanamayacağım konusunda bilgilendirildim.
          </p>
        </div>
      </div>
    </main>
  )
}
