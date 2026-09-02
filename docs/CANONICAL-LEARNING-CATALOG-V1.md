# Kanonik Konu/Kazanım Kataloğu ve Learning Graph Pipeline v1

Bu faz, Learning Graph şemasını gerçek ve denetlenebilir içerikle doldurur.

## Güven kaynakları

1. Aktif `curriculum` satırları ders/sınıf düğümleri üretir.
2. Sağlıklı `meb_resources` kayıtları doğrulanmış ünite düğümleri üretir.
3. `learning_topic_aliases.review_status = reviewed` kayıtları kanonik konu
   düğümleri üretir.
4. Öğrenci eventlerinde görülüp kanonik kataloğa bağlanamayan başlıklar
   `learning_catalog_review_queue` tablosuna alınır.

## Kazanım güvenlik kuralı

`learning_objective_catalog` yalnızca MEB, manuel veya kontrollü import
kaynaklı gerçek kazanım kodlarını kabul eder. Serbest metinden ya da AI
çıktısından kazanım kodu üretilmez. Doğrulanmamış kazanımlar öğrenciye açık
değildir ve soru eventlerine bağlanmaz.

## Grafik yönü

`part_of` ilişkisi çocuk düğümden ebeveyne gider:

```text
öğrenme_objective → topic → unit → subject
```

İlk sürümde güvenilir veri bulunduğu için yalnızca `unit → subject` bağlantısı
otomatik ve doğrulanmış olarak yayımlanır. Topic–unit ve objective–topic
ilişkileri içerik incelemesinden sonra eklenir.

## Gözlemlenebilirlik

- Her MEB kaynağı `learning_content_node_mappings` üzerinden ünite düğümüne
  izlenebilir şekilde bağlanır.
- Pipeline tekrar çalıştırılabilir ve benzersiz anahtarlar çoğaltmayı önler.
- `5. sınıf`, `Ortaokul 5. sınıf` ve `Ortaokul 5.sınıf` biçimleri aynı
  kanonik sınıf anahtarına dönüştürülür; okul seviyesi ayrı alanda korunur.
- Kaynak sağlığı bozuk kayıtlar otomatik katalog yayınından çıkarılır.
- Eşleşmeyen öğrenci konuları kullanım sayısına göre inceleme kuyruğunda
  önceliklendirilir.

Migration: `scripts/022_canonical_learning_catalog_pipeline_v1.sql`.

## Admin inceleme akışı

`scripts/025_learning_catalog_review_workflow.sql` ve
`/api/admin/learning-catalog-review` birlikte çalışır. Admin tek-sınıflı bir
adayı doğrulanmış MEB ünitesine bağladığında alias, topic node, `topic → unit`
edge'i ve kaynak mapping'i tek transaction içinde yayınlanır. Etkilenen event
boyutları kanonikleştirilir; mastery, profil ve öneriler yeniden hesaplanır.
Birden fazla sınıfta gözlenen başlıklar yanlış eşleştirmeyi önlemek için bu
sürümde onaylanamaz.
