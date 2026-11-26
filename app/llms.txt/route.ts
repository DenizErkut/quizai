// /llms.txt — yapay zekâ arama ve yanıt motorları için site özeti (llmstxt.org önerisi). Yalnızca herkese açık, doğrulanmış bilgi.
export const dynamic = 'force-static'

const body = `# Pratium

> Pratium, Türkiye'deki K-12 (ilkokul–lise) öğrencileri için MEB müfredatına uygun, yapay zekâ destekli, seviyeye göre uyum sağlayan bir test, analiz ve gelişim takip platformudur. Öğrenciler, öğretmenler ve veliler için ayrı deneyimler sunar. Ücretli bir platformdur (Gümüş, Altın ve Platin planları).

## Ürün
- [Öğrenciler için](https://pratium.com/for-students): Seviyeye göre otomatik zorluk ayarlayan sorular, günlük meydan okuma, açık uçlu sorular, sesli kitap.
- [Öğretmenler için](https://pratium.com/for-teachers): Sınıf risk dağılımı, yapay zekâ destekli sınıf analizi, ödev atama ve takip, basılı test ve kâğıt cevap aktarımı.
- [Veliler için](https://pratium.com/for-parents): Haftalık otomatik özet, riskli konu uyarıları, tek ekrandan gelişim takibi.
- [Planlar ve fiyatlar](https://pratium.com/pricing): Gümüş, Altın ve Platin planlarının karşılaştırması.
- [Özel koçluk](https://pratium.com/ozel-kocluk): Bireysel ve kurumsal koçluk başvurusu.

## Müfredat (MEB)
- [MEB müfredatı ve kazanımlar](https://pratium.com/mufredat): 1–12. sınıf, ders ve sınıfa göre doğrulanmış MEB kazanım listeleri (kazanım kodu, öğrenme çıktısı, ünite). Her ders-sınıf sayfası /mufredat/{sınıf}/{ders} biçimindedir.

## Yöntem ve güven
- [Metodoloji](https://pratium.com/methodology): Üç katmanlı yapay zekâ doğrulaması, MEB müfredatına bağlılık, adaptif test, Sokratik öğretim yaklaşımı.
- [Sık sorulan sorular](https://pratium.com/faq): Fiyatlandırma, veri güvenliği, desteklenen seviyeler.
- [Kaynaklar ve atıflar](https://pratium.com/kaynaklar): Kullanılan müfredat kaynakları ve lisans atıfları.
- [Gizlilik ve KVKK](https://pratium.com/privacy): Kişisel verilerin işlenmesi, saklama süreleri ve haklar.

## Optional
- [Hakkımızda](https://pratium.com/hakkimizda)
- [Kullanım şartları](https://pratium.com/terms)
- [Mesafeli satış sözleşmesi](https://pratium.com/mesafeli-satis)
- [Teslimat ve iade](https://pratium.com/teslimat-iade)
`

export function GET() {
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } })
}
