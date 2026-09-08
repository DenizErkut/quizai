# Kanonik Kazanım Import Staging v1

Bu aşama resmî veya manuel olarak doğrulanabilir kazanım kayıtlarını güvenli
bir ara alana yükler. Yüklenen satırlar otomatik olarak öğrenciye açılmaz,
Learning Graph'a bağlanmaz ve soru üretiminde kullanılmaz.

## Kabul edilen JSON biçimi

```json
[
  {
    "objective_code": "RESMI-KOD",
    "title": "Kazanım açıklaması",
    "level": "ortaokul",
    "grade": "5. sınıf",
    "subject": "Matematik",
    "unit": "Ünite adı",
    "topic": "Konu adı",
    "source_reference": "Kaynak sayfa veya belge bölümü"
  }
]
```

Bir parti en fazla 500 kayıt alır. Kod, başlık, kademe, sınıf, ders, ünite ve
konu zorunludur. Parti içindeki ve mevcut katalogdaki mükerrer kodlar geçersiz
işaretlenir. Sınıf adı mevcut kanonik sınıf kuralıyla normalize edilir.

## Güvenlik ve yayın kuralı

- Staging tabloları RLS ile korunur ve istemci rollerine kapalıdır.
- Import fonksiyonu yalnızca sunucu rolü tarafından çalıştırılabilir.
- Ham kaynak satırı denetim için `raw_payload` içinde korunur.
- Kaynak referansı bulunmayan veya yapısal doğrulamadan geçmeyen kayıtlar
  yayımlanamaz.
- `validated` yalnızca yapısal doğrulamayı ifade eder; pedagojik doğrulama
  değildir.
- Her geçerli satır admin tarafından ayrı ayrı incelenir; başlığı düzeltilebilir,
  doğrulanmış bir `topic → unit → subject` zincirine bağlanabilir veya gerekçeli
  olarak reddedilebilir.
- Satır onayı yayın değildir. İkinci ve açık bir “kontrollü yayımla” adımı
  `learning_objective_catalog` kaydını, `learning_objective` düğümünü ve
  doğrulanmış `objective → topic` kenarını tek transaction içinde oluşturur.
- Seçilen üst zincir sonradan geçersiz hâle gelirse yayın durur ve kısmi kayıt
  bırakılmaz. Yayımlanan satırlar staging ekranından silinmez; audit tablosuyla
  inceleme geçmişi korunur.

Migration: `scripts/027_learning_objective_import_staging.sql`.
Satır inceleme ve yayın migration'ı:
`scripts/029_learning_objective_review_publish.sql`.
