# Retention Kalibrasyonu v1

Bu ölçüm, öğrencinin önceki mastery düzeyi ile iki çalışma arasındaki süreyi
birleştirerek beklenen tekrar başarısını hesaplar ve gerçek test sonucu ile
karşılaştırır. Öğrenci puanını veya öneri politikasını henüz değiştirmez.

- Mevcut v1 zaman sabitleri korunur: düşük mastery `7`, orta `14`, yüksek `30` gün.
- Beklenen hatırlama = önceki mastery × zaman kaynaklı retention katsayısı.
- En az üç önceki kanıtı ve en az bir günlük aralığı olan tekrarlar ana örnekleme girer.
- Aynı gün testleri saklanır ancak retention kalibrasyonuna katılmaz.
- Geçmiş Learning Event verisi tekrarlanabilir biçimde ölçülür; yeni testler otomatik eklenir.
- Ham tablo ve özet görünümü yalnız service role'a açıktır; yönetici API'si ayrıca `is_admin` doğrular.

Yeterli uzun-aralıklı örneklem oluşmadan zaman sabitleri otomatik değiştirilmez.

