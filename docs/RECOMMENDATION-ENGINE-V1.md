# Recommendation Engine v1

Bu katman öğrencinin sıradaki en yararlı öğrenme aksiyonunu açıklanabilir,
deterministik sinyallerle seçer. AI çalışma planının anlatımını üretir; hangi
konunun öncelikli olduğuna AI tek başına karar vermez.

## Sinyaller ve öncelik

1. Doğrulanmış kavram yanılgısı (`misconception_review`)
2. Eksik ön koşul (`prerequisite_remediation`)
3. Düşük mastery (`mastery_practice`)
4. Düşük retention / tekrar zamanı (`spaced_review`)

Her öneri; puan, neden kodu, kullanıcıya uygun açıklama, kullanılan kanıt ve
motor sürümüyle saklanır. Eski aktif öneriler silinmez, `superseded` yapılarak
karar geçmişi korunur.

## Entegrasyon

- Her tamamlanan testten sonra Learning Event, Mastery ve Misconception
  güncellemelerinin ardından öneri kuyruğu yenilenir.
- Dört haftalık çalışma planı hedeflerini önce bu kuyruktan seçer.
- Migration henüz uygulanmamış ortamlarda mevcut `weak_topics` hedef seçimi
  fallback olarak çalışmaya devam eder.

## Güvenlik

Öğrenciler yalnızca kendi önerilerini okuyabilir. İstemci yazma yetkisine
sahip değildir; yenileme RPC'si yalnızca sunucu rolüne açıktır.
