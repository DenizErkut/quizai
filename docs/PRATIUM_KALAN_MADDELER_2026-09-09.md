# Pratium — Kalan Geliştirme Maddeleri

Son güncelleme: 9 Eylül 2026 — son geliştirme oturumları işlendi

Bu liste, mevcut yol haritası ve canlıya alınan son çalışmalar karşılaştırılarak hazırlanmıştır.

Durumlar:

- [x] Tamamlandı ve canlıya alındı.
- [ ] Açık veya yalnızca kısmen tamamlandı. Kısmi durum satırın sonunda açıklanır.

Learning Event temeli, mastery/retention kalibrasyonu, kısmi puan, misconception uzman incelemesi, alias, çözülme yaşam döngüsü ve yanlış pozitif ölçümü tamamlandı.

## 1. Katalog ve konu normalizasyonu — yüksek

- [ ] 36 konu adayı için eksik ünite kataloğu veya güvenilir MEB kaynağı oluşturmak.
- [ ] Farklı sınıflarda görülen 8 konu adayını sınıf/kaynak bazında ayrıştırmak.
- [ ] Hemen eşleştirilebilir 64 konu adayını uzman/admin incelemesinden geçirmek.
- [x] Konu alias sözlüğünü kontrollü genişletmek.
- [ ] Admin inceleme ekranına filtre, toplu işlem, değişiklik geçmişi ve geri alma eklemek. *(Temel inceleme akışı var; bu dört yönetim özelliğinin tamamı henüz bitmedi.)*
- [ ] Katalog kapsamı, eşleşme oranı ve bekleyen inceleme için kalite dashboard'u oluşturmak. *(Günlük kazanım pipeline ölçümü var; birleşik yönetici dashboard'u açık.)*

## 2. Resmî kazanım kataloğu — yüksek

- [x] MEB kazanım kodları ve açıklamaları için kontrollü import formatı hazırlamak.
- [ ] `learning_objective_catalog` tablosunu doğrulanmış verilerle doldurmak. *(5. sınıf Matematik pilot paketi yayımlandı; diğer ders ve sınıflar açık.)*
- [x] Pilot kazanımların `objective → topic → unit → subject` ilişkilerini Learning Graph’te yayımlamak.
- [x] Kazanım sürümleme ve müfredat yılı değişiklik yönetimini tamamlamak.
- [x] Yeni sorulara güvenli kanonik `learning_objective_id` yazmak; kazanım yoksa kimlik uydurmamak.
- [x] Kazanım düzeyi Mastery Engine v1 ve günlük soru → Learning Event kapsama ölçümünü eklemek.

## 3. Learning Graph ön koşulları — yüksek

- [ ] Ders ve sınıf bazında uzman ön koşul paketleri hazırlamak. *(Paket oluşturma/yayın altyapısı canlı; uzman tarafından gerçek paketlerin girilmesi açık.)*
- [x] AI önerileri için uzman onay/red akışı eklemek.
- [x] Graph sürümü, kaynak, güven düzeyi ve yayın geçmişini görünür yapmak.
- [x] Döngü, kopuk düğüm ve hatalı sınıf geçişi kalite testleri eklemek.
- [x] Ön koşul açığının Recommendation Engine etkisini ölçmek.

## 4. Misconception Engine — orta-yüksek

- [ ] Doğrulanmış yanılgıya özel kısa açıklama ve düzeltici mikro içerik üretmek. *(AI taslak + uzman onay + güvenli öğrenci erişimi pipeline'ı canlı; gerçek içeriklerin üretilip onaylanması açık.)*

## 5. Recommendation Engine v2 — yüksek

- [ ] Önerilerin uygulanma, ertelenme, reddedilme ve tamamlanma durumlarını izlemek.
- [x] Öneri sonrası performans artışını ölçmek.
- [ ] Zaman bütçesi, sınav tarihi, öğretmen ödevi ve kurum planını önceliklendirmeye katmak.
- [ ] Çeşitlilik ve yük dengeleme kuralları eklemek.
- [ ] Öğretmen ve veli için açıklanabilir öneri özetleri sunmak.
- [ ] Öneri politikalarını A/B veya gölge testleriyle karşılaştırmak.

## 6. Adaptive Learning v3 — yüksek

- [ ] Adaptasyonu soru bazına taşımak.
- [ ] Soru türü, ipucu, anlatım biçimi ve ön koşul kapsamını adapte etmek.
- [ ] Öğrencinin sıkışmasını ve gereksiz kolay soruları önleyen sınırlar eklemek.
- [ ] Adaptif ve standart grupları öğrenme kazanımıyla karşılaştırmak.
- [ ] Öğretmene adaptasyon gerekçesi ve manuel müdahale seçeneği sunmak.

## 7. Kullanıcı deneyimleri — orta-yüksek

- [ ] Öğrenci dashboard’unda “Şimdi ne çalışmalıyım ve neden?” alanını merkezileştirmek.
- [ ] Mastery, retention, misconception ve öneri geçmişini sade görsellerle sunmak.
- [ ] Öğretmene sınıf ortak eksikleri ve müdahale önerileri vermek.
- [ ] Veli ekranında teknik olmayan gelişim ve destek önerileri göstermek.
- [ ] Kurum ekranına sınıf, şube, öğretmen ve dönem karşılaştırmaları eklemek.
- [x] Bildirim sıklığı ve önemini kullanıcı tercihleriyle yönetmek. (`notification_preferences` tablosu, RLS ve kullanıcı API'si canlı.)

## 8. AI Tutor ve ajanlar — orta

- [x] AI Tutor’u Student Learning Profile, Recommendation Engine ve Learning Graph’e bağlamak.
- [x] Seviye uygunluğu, kontrollü ipucu ve Socratic yönlendirme politikaları oluşturmak.
- [x] Öğretmen onayı gereken işlemleri otomatik işlemlerden ayırmak. (Service-only ajan öneri kuyruğu, sınıf sahibi öğretmen kapsamı ve tek-seferlik onay/red yaşam döngüsü.)
- [ ] Sınırlı yetkili planlama, içerik, tekrar ve ilerleme ajanları geliştirmek.
- [x] Ajan kararlarını kanıt, neden ve sürüm bilgisiyle denetlenebilir yapmak. (AI Tutor dahil tüm sınırlı ajanlarda ham çıktı içermeyen, service-role-only karar denetimi.)
- [x] Yaş, güvenlik, mahremiyet ve pedagojik doğruluk kontrolleri eklemek. (Tutor Safety v2: yaş/sınıf bağlamı, kişisel veri, tehlikeli talimat, kriz yönlendirmesi, prompt enjeksiyonu ve çıktı güvenlik kapısı.)

## 9. Tahmine dayalı öğrenme ve operasyon — yüksek

- [ ] Unutma, konu riski, sınav performansı ve öğrenme tıkanması tahminleri geliştirmek.
- [ ] Tahminleri gerçek sonuçlarla sürekli kalibre etmek.
- [ ] Tenant izolasyon testlerini otomatikleştirmek.
- [x] Pipeline alarm, gecikme ve hata dashboard’ları kurmak. (24 saatlik AI p95 gecikme, maliyet, kullanıcı/oturum bağlam boşluğu ve Learning Event kapsaması yönetici ekranında eşiklerle izleniyor.)
- [x] Migrasyon geri alma, yeniden hesaplama ve veri kurtarma runbook'larını tamamlamak. (`docs/PRATIUM_OPERASYON_RUNBOOK_V1.md`)
- [ ] Veri saklama, silme talepleri, KVKK ve çocuk verisi kontrollerini güçlendirmek.
- [x] Maliyet, gecikme ve AI bütçelerini izlemek. *(Temel kullanım/maliyet logları ve dönemsel fiyatlandırma canlı; operasyonel alarm eşikleri ayrıca geliştirilebilir.)*

## 10. Pilot teslimat sırası

1. [x] Kullanım yoğunluğuna göre ilk pilot katalog adaylarını incelemek.
2. [x] Pilot kapsamındaki eksik üniteleri güvenilir kaynakla tamamlamak.
3. [x] 5. sınıf Matematik için resmî kazanımları kontrollü içe aktarmak.
4. [x] Pilot kazanımları konu ve ünitelere bağlamak.
5. [x] Yeni sorulara `learning_objective_id` yazmak.
6. [x] `quiz_session → learning_event → mastery → profile → recommendation` zincirini uçtan uca doğrulamak.
7. [x] Günlük katalog eşleşme ve Learning Event aktarım oranını raporlamak.

## Güncel kalan maddeler — önerilen sıra

1. [x] **Recommendation Engine v2 yaşam döngüsü:** önerinin uygulanması, ertelenmesi, reddedilmesi ve tamamlanmasını izlemek. Durum geçişleri, değiştirilemez olay tarihçesi, güvenli öğrenci işlemleri ve dashboard kartı tamamlandı.
2. **Pilot içerik operasyonu:** doğrulanmış yanılgılar için mikro içerikleri üretip uzman onayından geçirmek; uzman ön koşul paketlerini doldurmak. Operasyon ekranı kapsam sayaçları ve sıradaki taslak akışı hazır; 31 içerik ve ön koşul paketleri uzman işlemi bekliyor.
3. **Katalog kapsamını büyütmek:** kalan 36 eksik üniteyi, 8 çok-sınıflı adayı ve 64 inceleme adayını tamamlamak; yeni ders/sınıflara resmî kazanım import etmek. İnceleme kuyruğuna kapsam sayaçları (bekleyen/eşleşen/katalog düğümü) eklendi; gerçek eşleştirmeler uzman onayı bekliyor.
4. [x] **Recommendation Engine v2 önceliklendirme:** zaman bütçesi, sınav tarihi, öğretmen ödevi, kurum planı, çeşitlilik ve yük dengeleme. Bağlamsal sıralama RPC'si, açıklanabilir puan kırılımı ve güvenli öncelik API'si tamamlandı.
5. [x] **Adaptive Learning v3:** ikinci test parçasında soru-bazlı performans politikasına göre zorluk ve desteklenen soru türü değişimi; güvenlik sınırları uygulandı. Tam her-soru üretim döngüsü ve adaptif/standart etki karşılaştırması sonraki alt iş.
6. **Rol bazlı deneyimler:** öğrenci, öğretmen, veli ve kurum ekranlarında açıklanabilir karar katmanları. Öğrenci, öğretmen ve kurum öğrenme özetleri v1 tamamlandı; veli alt ekranı ve ortak karşılaştırmalar sırada.
7. **AI Tutor ve sınırlı ajanlar:** Learning Profile + Recommendation + Learning Graph bağlamıyla güvenli çalışma.
8. **Operasyonel olgunluk:** tenant izolasyonu, pipeline alarmları, kurtarma runbook'ları ve KVKK/çocuk verisi kontrolleri.
