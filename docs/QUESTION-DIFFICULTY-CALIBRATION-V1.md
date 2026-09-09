# Question Difficulty Calibration v1

Bu faz, AI tarafından verilen `kolay / normal / zor / çok zor` etiketlerini gerçek öğrenci sonuçlarıyla ölçer. Üretim davranışını veya Mastery Engine ağırlıklarını otomatik değiştirmez.

## Veri gerçeği

- İlk incelemede 1.997 Learning Event'in hiçbirinde kalıcı `question_id` yoktu.
- Soru metniyle 1.958 benzersiz soru belirlendi.
- Yalnızca 22 soru en az iki kez, 2 soru en az beş kez görülmüştü.

Bu nedenle v1 iki seviyelidir:

1. Her Learning Event'e normalize soru metninden kararlı `qv1_*` kimliği atanır.
2. Etiket kalibrasyonu ders, sınıf ve zorluk etiketi kohortunda ölçülür; tekil soru sonucu ancak en az 5 yanıt ve 3 farklı öğrenci olduğunda uygun sayılır.

## Ölçüm

Önceki konu kanıtlarından Bayesian-smoothed mastery hesaplanır. Kolay, normal, zor ve çok zor etiketleri için başlangıç başarı beklentisi öğrencinin mastery seviyesiyle lojistik olarak ayarlanır. Gerçek cevap sonucu ile beklenen başarı arasındaki fark saklanır.

- En az 3 önceki konu kanıtı: etiket kalibrasyonuna uygun.
- En az 20 uygun cevap ve 3 farklı öğrenci: kohort için yön belirtmeye yeterli.
- Ortalama fark `+8` puanın üstündeyse etiketinden daha kolay.
- Ortalama fark `-8` puanın altındaysa etiketinden daha zor.

## Güvenlik ve davranış

- Ham ölçüm ve özetler yalnızca service role tarafından okunabilir.
- Yönetici API'si ayrıca `profiles.is_admin` doğrulaması yapar.
- Sonuçlar öğrenci testini, mastery skorunu ve Recommendation Engine'i değiştirmez.
- İleride yeterli örneklem oluştuğunda kontrollü gölge değerlendirme sonrası ağırlıklara yansıtılabilir.

## Geri alma

Ölçüm tetikleyicisi kaldırılabilir; tablo ve görünümler üretim test akışından bağımsızdır. `learning_events.question_id` geri alınmamalıdır: geçmiş olaya eklenen kimlik, akademik sonucu değiştirmeyen tamamlayıcı bir boyuttur.
