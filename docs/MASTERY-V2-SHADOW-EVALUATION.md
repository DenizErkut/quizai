# Mastery Engine v2 — Gölge Değerlendirme

Bu aşama, mevcut Mastery Engine v1'i değiştirmeden v2 adayını aynı tarihsel testler üzerinde ölçer. `student_mastery`, öneriler ve öğrenci ekranları v1 kullanmayı sürdürür.

## Karşılaştırma

- Her test için yalnızca test başlamadan önce oluşmuş Learning Event kanıtı kullanılır.
- v1, mevcut Bayesian mastery tahminidir.
- v2 aynı başlangıç tahminine muhafazakâr retention ve soru-zorluk düzeltmesi uygular.
- İki tahmin aynı gerçek test yüzdesiyle MAE, RMSE ve galibiyet sayısı üzerinden karşılaştırılır.

## Muhafazakâr sınırlar

- Retention etkisi tam unutma eğrisi değildir; etkinin yalnızca `%25`i uygulanır. Böylece uzun aralarda tahmin en fazla `%25` azalır.
- Zorluk düzeltmesi yalnızca testten önce en az 20 yanıt ve 3 öğrenci bulunan ders/sınıf/zorluk kohortundan gelir.
- Kohort hatasının `%25`i kullanılır ve düzeltme `-5/+5` puanla sınırlandırılır.
- En az üç önceki konu kanıtı olmayan satırlar saklanır fakat model karar örneklemine alınmaz.

## Güvenlik ve yayın koşulu

Ölçüm tablosu RLS ile kapalıdır; istemci rolleri erişemez. Yönetici API'si sunucu tarafında yönetici doğrulaması yapar. v2 ancak yeterli farklı öğrenci/test örneklemi, ders bazında tutarlı MAE/RMSE iyileşmesi ve regresyon incelemesi sonrasında ayrı bir kontrollü yayın kararıyla üretime geçirilebilir.
