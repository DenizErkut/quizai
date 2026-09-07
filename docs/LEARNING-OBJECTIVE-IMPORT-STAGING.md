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
- Kazanımın `learning_objective_catalog` içine alınması ve graph bağlantılarının
  kurulması sonraki açık admin onayıyla yapılacaktır.

Migration: `scripts/027_learning_objective_import_staging.sql`.
