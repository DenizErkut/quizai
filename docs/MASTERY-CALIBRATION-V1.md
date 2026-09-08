# Mastery Kalibrasyonu v1

Bu katman, bir öğrencinin konu mastery skorunun sonraki test başarısını ne
kadar doğru öngördüğünü ölçer. Mastery hesabını veya öğrenci deneyimini
değiştirmez; yalnızca karar motorunun doğruluğu için denetlenebilir ölçüm üretir.

## Ölçüm

- Tahmin, ilgili testten **önceki** aynı öğrenci + kanonik ders + konu Learning
  Event kayıtlarından Mastery Engine v1 formülüyle yeniden hesaplanır.
- Gerçek sonuç, takip eden testteki soru puanlarının yüzdesidir.
- Tahmin hatası, mutlak hata ve kare hata saklanır.
- En az üç önceki kanıtı olmayan ölçümler korunur ancak ana kalibrasyon
  örneklemine dahil edilmez (`is_eligible = false`).
- Sonuçlar 10 puanlık tahmin bantlarında ders bazında raporlanır.

## Geçmiş veri ve yeni testler

Migrasyon geçmiş Learning Event oturumlarını tekrarlanabilir biçimde ölçer.
Yeni testler, Learning Event yazıldığında otomatik olarak eklenir. Oturum ve
konu boyutundaki benzersizlik kuralı mükerrer ölçümü engeller.

## Güvenlik

Ham ölçüm tablosu ve özet görünümü istemci rollerine kapalıdır. Yalnızca service
role erişebilir; yönetici API'si ayrıca oturum açmış kullanıcının `is_admin`
olduğunu doğrular. Görünüm `security_invoker` olarak tanımlanmıştır.

## Yorumlama sınırı

Bu rapor korelasyon ve kalibrasyon ölçer. Küçük veya dengesiz örneklemde model
değişikliği yapılmamalıdır. Ders/sınıf/kazanım kırılımı için yeterli örneklem
oluştuğunda v2 gölge algoritma karşılaştırmasına geçilmelidir.

