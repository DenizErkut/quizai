# Pratium Operasyon Runbook v1

Bu belge, üretimde veri yaşam döngüsü, Learning Event/mastery yeniden hesaplama ve migrasyon geri alma işlemlerinin kontrollü yürütülmesi içindir.

## 1. Değişiklik öncesi kapı

- Git çalışma ağacının temiz olduğunu ve hedef commit’in `main` üzerinde bulunduğunu doğrula.
- Supabase production yedeğinin ve geri yükleme noktasının tarihini kaydet.
- Migrasyonun yalnızca `supabase/migrations/` içinden, sıralı ve tekrarlanabilir çalışacağını doğrula.
- Büyük backfill öncesi etkilenecek satır sayısını dry-run ile ölç; beklenen kapsam dışındaysa işlemi durdur.

## 2. Migrasyon geri alma

Pratium migrasyonları ileriye dönük ve idempotent’tir; production’da uygulanmış migrasyon dosyası değiştirilmez. Geri dönüş gerektiğinde:

1. Etkilenen migrasyon ve bağımlı API commit’ini belirle.
2. Supabase geri yükleme noktası veya incelenmiş ters migrasyon ile yeni bir migration oluştur; doğrudan tablo silme çalıştırma.
3. Önce staging’de `supabase db reset`/migration doğrulaması, sonra dar kapsamlı production doğrulaması yap.
4. RLS, foreign key ve indekslerin geri dönüş sonrası kontrolünü kayda al.

## 3. Learning Event ve mastery yeniden hesaplama

- Backfill’i parti büyüklüğü sınırlı, yeniden çalıştırılabilir bir işlem olarak yürüt.
- `learning_events` için benzersiz olay anahtarını koru; aynı test/cevap ikinci kez yazılmamalı.
- Mastery yeniden hesaplamasını önce geçici sonuç kümesine yaz, örneklem ve toplamları karşılaştır, ardından atomik upsert yap.
- Önce/sonra kapsamı, hata sayısı, konu eşleşme oranı ve en yüksek skor değişimlerini sakla.
- İşlem yarıda kalırsa son başarılı partiden devam et; tüm öğrenciyi baştan silip üretme.

## 4. Veri kurtarma ve KVKK

- Silme talebi çalıştırmadan önce etki önizlemesi ve ikinci yönetici onayı zorunludur.
- Kalıcı silme sonrası kullanıcı kimliği yerine talep kimliğiyle denetim kaydı bırak; içerik loglarında ham AI çıktısı veya hassas profil alanı tutma.
- Kurtarma yalnızca yetkili yönetici tarafından, yasal saklama ve silme kapsamı doğrulanarak yapılır.
- Her olayda zaman, operatör, migration/commit, etkilenen satır sayısı ve sonuç kaydedilir.

## 5. Olay sonrası doğrulama

- API sağlık kontrolü, RLS tenant izolasyonu ve kritik akış smoke testlerini çalıştır.
- Learning Event kapsama, mastery güncelleme gecikmesi, hata oranı ve bildirim kuyruğunu kontrol et.
- Bulguları ilgili release notuna ve değişiklik geçmişine ekle; anomali varsa yeni yazımları durdurup geri dönüş planını uygula.

