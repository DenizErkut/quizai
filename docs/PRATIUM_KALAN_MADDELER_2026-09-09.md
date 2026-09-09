# Pratium — Kalan Geliştirme Maddeleri

Güncelleme: 9 Eylül 2026

Bu liste, mevcut yol haritası ve canlıya alınan son çalışmalar karşılaştırılarak hazırlanmıştır. Learning Event temeli, mastery/retention kalibrasyonu, kısmi puan, misconception uzman incelemesi, alias ve yanlış pozitif ölçümü tamamlandı.

## 1. Katalog ve konu normalizasyonu — yüksek

- 36 konu adayı için eksik ünite kataloğu veya güvenilir MEB kaynağı oluşturmak.
- Farklı sınıflarda görülen 8 konu adayını sınıf/kaynak bazında ayrıştırmak.
- Hemen eşleştirilebilir 64 konu adayını uzman/admin incelemesinden geçirmek.
- Konu alias sözlüğünü kontrollü genişletmek.
- Admin inceleme ekranına filtre, toplu işlem, değişiklik geçmişi ve geri alma eklemek.
- Katalog kapsamı, eşleşme oranı ve bekleyen inceleme için kalite dashboard'u oluşturmak.

## 2. Resmî kazanım kataloğu — yüksek

- MEB kazanım kodları ve açıklamaları için kontrollü import formatı hazırlamak.
- `learning_objective_catalog` tablosunu doğrulanmış verilerle doldurmak.
- `objective → topic → unit → subject` ilişkilerini Learning Graph’te yayımlamak.
- Kazanım sürümleme ve müfredat yılı değişiklik yönetimini tamamlamak.

## 3. Learning Graph ön koşulları — yüksek

- Ders ve sınıf bazında uzman ön koşul paketleri hazırlamak.
- AI önerileri için uzman onay/red akışı eklemek.
- Graph sürümü, kaynak, güven düzeyi ve yayın geçmişini görünür yapmak.
- Döngü, kopuk düğüm ve hatalı sınıf geçişi kalite testleri eklemek.
- Ön koşul açığının Recommendation Engine etkisini ölçmek.

## 4. Misconception Engine — orta-yüksek

- Doğrulanmış yanılgıya özel kısa açıklama ve düzeltici mikro içerik üretmek.

## 5. Recommendation Engine v2 — yüksek

- Önerilerin uygulanma, ertelenme, reddedilme ve tamamlanma durumlarını izlemek.
- Öneri sonrası performans artışını ölçmek.
- Zaman bütçesi, sınav tarihi, öğretmen ödevi ve kurum planını önceliklendirmeye katmak.
- Çeşitlilik ve yük dengeleme kuralları eklemek.
- Öğretmen ve veli için açıklanabilir öneri özetleri sunmak.
- Öneri politikalarını A/B veya gölge testleriyle karşılaştırmak.

## 6. Adaptive Learning v3 — yüksek

- Adaptasyonu soru bazına taşımak.
- Soru türü, ipucu, anlatım biçimi ve ön koşul kapsamını adapte etmek.
- Öğrencinin sıkışmasını ve gereksiz kolay soruları önleyen sınırlar eklemek.
- Adaptif ve standart grupları öğrenme kazanımıyla karşılaştırmak.
- Öğretmene adaptasyon gerekçesi ve manuel müdahale seçeneği sunmak.

## 7. Kullanıcı deneyimleri — orta-yüksek

- Öğrenci dashboard’unda “Şimdi ne çalışmalıyım ve neden?” alanını merkezileştirmek.
- Mastery, retention, misconception ve öneri geçmişini sade görsellerle sunmak.
- Öğretmene sınıf ortak eksikleri ve müdahale önerileri vermek.
- Veli ekranında teknik olmayan gelişim ve destek önerileri göstermek.
- Kurum ekranına sınıf, şube, öğretmen ve dönem karşılaştırmaları eklemek.
- Bildirim sıklığı ve önemini kullanıcı tercihleriyle yönetmek.

## 8. AI Tutor ve ajanlar — orta

- AI Tutor’u Student Learning Profile, Recommendation Engine ve Learning Graph’e bağlamak.
- Seviye uygunluğu, kontrollü ipucu ve Socratic yönlendirme politikaları oluşturmak.
- Öğretmen onayı gereken işlemleri otomatik işlemlerden ayırmak.
- Sınırlı yetkili planlama, içerik, tekrar ve ilerleme ajanları geliştirmek.
- Ajan kararlarını kanıt, neden ve sürüm bilgisiyle denetlenebilir yapmak.
- Yaş, güvenlik, mahremiyet ve pedagojik doğruluk kontrolleri eklemek.

## 9. Tahmine dayalı öğrenme ve operasyon — yüksek

- Unutma, konu riski, sınav performansı ve öğrenme tıkanması tahminleri geliştirmek.
- Tahminleri gerçek sonuçlarla sürekli kalibre etmek.
- Tenant izolasyon testlerini otomatikleştirmek.
- Pipeline alarm, gecikme ve hata dashboard’ları kurmak.
- Migrasyon geri alma, yeniden hesaplama ve veri kurtarma runbook’larını tamamlamak.
- Veri saklama, silme talepleri, KVKK ve çocuk verisi kontrollerini güçlendirmek.
- Maliyet, gecikme ve AI bütçelerini izlemek.

## 10. Pilot teslimat sırası

1. Kullanım yoğunluğuna göre ilk 20 katalog adayını incelemek.
2. Eksik üniteleri güvenilir kaynaklarla tamamlamak.
3. Bir pilot ders/sınıf için resmî kazanımları içe aktarmak.
4. Kazanımları konu ve ünitelere bağlamak.
5. Yeni sorulara `learning_objective_id` yazmak.
6. `quiz_session → learning_event → mastery → profile → recommendation` zincirini uçtan uca doğrulamak.
7. Pilot öncesi/sonrası katalog eşleşme oranını raporlamak.

## Önerilen bir sonraki teknik iş

**Kanonik MEB kazanım kataloğunun pilot ders/sınıf için içe aktarılması ve soru-kazanım eşleşme oranının yükseltilmesi.** Bugünkü canlı veride 150 sorunun 20’sinde kazanım eşleşmesi bulunduğu için en yüksek ölçülebilir fayda bu aşamadadır.
