# Pratium.com — Son 4 Günlük Geliştirme Raporu ve Kalan Yol Haritası

**Rapor tarihi:** 3 Eylül 2026  
**İncelenen dönem:** 31 Ağustos–3 Eylül 2026  
**Kaynak:** Git commit geçmişi, uygulama kodu, Supabase migrasyonları ve proje içi teknik dokümanlar  
**Ana hedef:** Pratium'u test üreten ve raporlayan bir uygulamadan, öğrencinin durumunu sürekli güncelleyen ve bir sonraki öğrenme adımını belirleyen açıklanabilir bir **Agentic Learning OS** yapısına taşımak.

---

## 1. Yönetici özeti

Son dört günde iki paralel alanda ilerleme sağlandı:

1. Pratium'un öğrenci ve rapor ekranları daha sıcak, anlaşılır ve mobil uyumlu bir görsel sisteme taşındı.
2. Learning OS vizyonunun veri ve karar altyapısı kuruldu: Learning Event, Mastery, Student Learning Profile, Learning Graph, Misconception, Recommendation ve Adaptive Learning katmanları birbirine bağlandı.

Bu dönemin sonunda sistem artık yalnızca bir test sonucunu saklamıyor. Her soruyu ayrı bir öğrenme kanıtı olarak kaydediyor, öğrencinin konu hâkimiyetini güncelliyor, kavram yanılgısı sinyallerini topluyor, sıradaki çalışma önerisini üretiyor ve yeni testin başlangıç politikasını bu öğrenci durumuna göre belirleyebiliyor.

Mevcut `quiz_sessions` ve `weak_topics` davranışları kaldırılmadı. Yeni altyapı eklemeli ve geriye uyumlu biçimde devreye alındı; gerekli yerlerde eski sistem fallback olarak korunuyor.

---

## 2. Son dört günde tamamlanan geliştirmeler

### 2.1 Arayüz ve kullanıcı deneyimi

- Ana sayfa, giriş/kayıt, dashboard, öğrenci, öğretmen, veli, kurum ve test ekranları ortak sıcak görsel dile geçirildi.
- Öğrenci raporlarına görsel performans analizleri eklendi.
- Mobil ve yazdırılabilir rapor yerleşimleri iyileştirildi.
- Çerez onayı ve çerez politikası akışı eklendi.
- Prati maskotu daha sıcak ve hareketli hâle getirildi.
- AI soru üretiminde birbirine çok benzeyen soruları kod seviyesinde engelleyen deterministik benzerlik kontrolü eklendi.

### 2.2 Pratium Learning Data Standard

- `learning_events` ile soru bazında değişmez öğrenme olay günlüğü oluşturuldu.
- Her event; öğrenci, test, soru sırası, konu, ders, zorluk, doğruluk ve mevcut metadata ile ilişkilendirildi.
- Aynı testin tekrar kaydedilmesinin mükerrer event üretmesini engelleyen benzersizlik kuralı eklendi.
- Test kaydetme akışı yeni olay günlüğüne bağlandı.
- Mevcut test ve `weak_topics` davranışı korunarak geriye uyumlu geçiş sağlandı.

### 2.3 Mastery Engine v1

- Öğrencinin konu hâkimiyetini zorluk ağırlıklı doğruluk ve Bayesian öncülle hesaplayan ilk sürüm kuruldu.
- Kanıt miktarını gösteren güven skoru eklendi.
- Son çalışma zamanına bağlı retention/unutma riski hesaplandı.
- Son iki 30 günlük pencereyi karşılaştıran `improving`, `stable` ve `declining` trendleri eklendi.
- Algoritma `v1` olarak sürümlendi; geçmiş eventlerden yeniden hesaplanabilir hâle getirildi.

### 2.4 Student Learning Profile v1

- Öğrenci için merkezi ve PII içermeyen akademik profil oluşturuldu.
- Güçlü, zayıf ve tekrar zamanı gelmiş konular türetilmeye başlandı.
- Ders bazlı özet, genel trend, kanıta dayalı öğrenme hızı ve doğrulanmış yanılgı sinyalleri profile bağlandı.
- Profil her mastery güncellemesinden sonra otomatik yenileniyor.

### 2.5 Learning Graph v1

- Konu ve kazanım ilişkileri için genişletilebilir node/edge veri modeli kuruldu.
- `prerequisite_of` ve `part_of` ilişki tiplerinin temeli oluşturuldu.
- AI tarafından önerilen ilişkilerin otomatik yayımlanması engellendi; admin/uzman onayı zorunlu kılındı.
- Quiz üretimindeki ön koşul değerlendirmesi Learning Event tabanlı mastery verisine bağlandı.
- Eski `topic_prerequisites` yapısı fallback olarak korundu.

### 2.6 Misconception Engine v1

- Yanlış seçeneklerin temsil ettiği olası kavramsal hatalar soru metadata'sında tutulmaya başlandı.
- Öğrencinin seçtiği yanlış seçenek ilgili misconception sinyaline bağlandı.
- Tek hata kesin teşhis sayılmıyor; üç bağımsız kanıtta `confirmed` durumuna geçiliyor.
- Cevapsız veya güvenilir biçimde yorumlanamayan soruların yanlış sinyal üretmesi engellendi.
- Bozuk seçenek metadata'sını güvenli biçimde normalize eden kontroller eklendi.

### 2.7 Recommendation Engine v1

- Öğrencinin sıradaki çalışma adımını belirleyen açıklanabilir karar katmanı kuruldu.
- Öncelik sırası şu şekilde tanımlandı:
  1. doğrulanmış kavram yanılgısı,
  2. eksik ön koşul,
  3. düşük mastery,
  4. düşük retention / tekrar zamanı.
- Her öneri puan, neden kodu, açıklama, kanıt ve algoritma sürümüyle saklanıyor.
- Önceki öneriler silinmiyor; karar geçmişini korumak için `superseded` yapılıyor.
- Dört haftalık çalışma planının konu seçimi Recommendation Engine'e bağlandı.

### 2.8 Adaptive Learning Engine v2

- Testin başlangıç zorluğu ve pedagojik odağı aktif öğrenci önerisine göre belirlenmeye başlandı.
- Ön koşul eksiği, misconception tekrarı, spaced review ve mastery practice için ayrı başlangıç politikaları tanımlandı.
- Testin ikinci bölümündeki zorluk, ilk bölümün gerçek performansına göre ayarlanmaya devam ediyor.
- Her soruda adaptif kararın sürümü, odağı, neden kodu ve öneri kimliği saklanıyor.

### 2.9 Tarihsel Learning Event backfill ve taksonomi normalizasyonu

- Eski `quiz_sessions` kayıtlarını küçük ve kontrollü partilerle Learning Event'e aktarabilen backfill altyapısı kuruldu.
- Orijinal test, soru ve cevap verileri değiştirilmedi.
- Tarihsel eventler `backfilled`, `backfill_version` ve `original_topic` bilgileriyle izlenebilir hâle getirildi.
- Aynı partinin yeniden çalıştırılmasının mükerrer event üretmesi engellendi.
- Ders/konu yazım farkları için alias ve normalizasyon yapısı kuruldu.
- Anlamsal olarak farklı konuların otomatik birleştirilmesi engellendi.
- Backfill sonrasında mastery, profil ve önerilerin yeniden hesaplanması sağlandı.

### 2.10 Kanonik konu/kazanım kataloğu ve içerik pipeline'ı

- Aktif müfredat dersleri ve sağlıklı MEB kaynakları kanonik graph düğümlerine dönüştürüldü.
- Üniteler derslere doğrulanmış `part_of` ilişkileriyle bağlandı.
- Kaynak kayıt ile graph düğümü arasında izlenebilir mapping tablosu oluşturuldu.
- Gerçek ve doğrulanabilir kaynak bulunmadan kazanım kodu üretilmemesi güvenlik kuralı olarak uygulandı.
- Kataloğa bağlanamayan öğrenci konu başlıkları kullanım yoğunluğuna göre inceleme kuyruğuna alındı.
- Sınıf adları kanonik biçime dönüştürüldü.

### 2.11 Yönetici katalog inceleme akışı

- Admin panelindeki **Müfredat Yönetimi** bölümüne katalog inceleme kuyruğu eklendi.
- Yönetici tek sınıfa ait bir konu adayını uygun MEB ünitesine bağlayabiliyor veya kapsam dışı bırakabiliyor.
- Onay işlemi tek transaction içinde alias, topic node, `topic → unit` ilişkisi ve kaynak mapping'i oluşturuyor.
- Etkilenen Learning Event boyutları normalize edilip mastery, profil ve öneriler yeniden hesaplanıyor.
- İşlem yalnızca yönetici ve sunucu rolüne açık; istemciye doğrudan yazma yetkisi verilmedi.

---

## 3. Canlı veri ve katalog durumu

Son doğrulamada katalog altyapısında:

| Gösterge | Değer |
|---|---:|
| Ders düğümü | 64 |
| Ünite düğümü | 66 |
| Konu düğümü | 24 |
| Doğrulanmış `part_of` ilişkisi | 66 |
| Kaynak içerik eşlemesi | 66 |
| İnceleme kuyruğundaki aday | 108 |
| Tek sınıfa ait aday | 100 |
| Mevcut üniteye hemen bağlanabilir aday | 64 |
| Uygun ünitesi henüz katalogda olmayan aday | 36 |
| Birden fazla sınıfta gözlenen ve ayrıştırılması gereken aday | 8 |

Bu 108 konu eğitimsel doğruluk açısından otomatik onaylanmadı; insan incelemesini bekliyor.

---

## 4. Doğrulama ve güvenlik çalışmaları

- Yeni veritabanı fonksiyonlarında istemci rollerinin çalıştırma izinleri kaldırıldı; gerekli işlemler yalnızca `service_role` üzerinden yürütülüyor.
- Öğrencilerin yalnızca kendi mastery, profil ve öneri kayıtlarını okuyabilmesi için RLS sınırları korundu.
- Yeni Learning Event kayıtlarının idempotency davranışı kontrol edildi.
- Canlı testlerle soru sayısı, event sayısı, doğru/yanlış toplamları ve mastery güncellemeleri karşılaştırıldı.
- Güncel ve tarihsel testler üzerinden backfill karşılaştırmaları yapıldı.
- TypeScript ve yeni eklenen dosyaların kod kalite kontrolleri geçti.
- Üretim derlemesi kod derleme ve tip kontrolünü geçti. Yerel doğrulamanın sayfa verisi toplama aşamasında mevcut `/api/admin/institutions` rotası, yerel Supabase ortam değişkeni eksik olduğu için durdu; bu durum yeni Learning OS geliştirmelerinden kaynaklanmıyor.
- Migrasyonlar canlı Supabase projesine uygulandı ve kod `main` dalına gönderildi.

---

## 5. Dönemin commit özeti

| Commit | Tarih | İçerik |
|---|---|---|
| `77038e2` | 31 Ağustos | Ana arayüzün sıcak görsel sistemle yenilenmesi |
| `4f16b40` | 31 Ağustos | AI sorularında deterministik tekrar tespiti |
| `fd553d2` | 1 Eylül | Öğrenci raporlarına görsel analizler |
| `8eb1829` | 1 Eylül | Çerez onayı ve responsive yazdırma düzenleri |
| `5d5a767` | 1 Eylül | Prati maskot animasyonu |
| `7b759cb` | 2 Eylül | Learning Events ve Mastery Engine v1 |
| `6f5d638` | 2 Eylül | Ders ve adaptif zorluk metadata'sının saklanması |
| `f11af08` | 2 Eylül | Student Learning Profile v1 |
| `ae9c834` | 2 Eylül | Learning Graph v1 temeli |
| `97ca6c6` | 2 Eylül | Learning Graph inceleme indeksleri |
| `2ec18dc` | 2 Eylül | Misconception Engine v1 |
| `3a6cb8a` | 2 Eylül | Misconception seçenek metadata normalizasyonu |
| `2897523` | 2 Eylül | Recommendation Engine v1 |
| `54ff3e9` | 2 Eylül | Adaptive Learning Engine v2 |
| `f587b35` | 2 Eylül | Tarihsel backfill ve taksonomi normalizasyonu |
| `9ddbffa` | 2 Eylül | Kanonik öğrenme kataloğu pipeline'ı |
| `4325f74` | 3 Eylül | Admin katalog inceleme ve eşleştirme akışı |

---

## 6. Kalan geliştirme maddeleri

### Aşama 1 — Katalog kapsamını tamamlama

**Öncelik: Çok yüksek**

- [ ] Uygun ünitesi bulunmayan 36 konu adayı için eksik ünite kataloğunu oluşturmak veya güvenilir MEB kaynağına bağlamak.
- [ ] Birden fazla sınıfta görülen 8 konu adayını sınıf/kaynak bazında güvenli biçimde ayrıştırmak.
- [ ] Hemen eşleştirilebilir 64 konu adayını içerik uzmanı/admin incelemesinden geçirmek.
- [ ] Konu alias sözlüğünü kontrollü biçimde genişletmek.
- [ ] Admin inceleme ekranına filtreleme, toplu işlem, değişiklik geçmişi ve geri alma görünümü eklemek.
- [ ] Katalog kapsamı, eşleşme oranı ve bekleyen inceleme sayıları için yönetici kalite dashboard'u oluşturmak.

**Tamamlanma ölçütü:** Aktif test konularının en az `%95`inin kanonik ders, sınıf, ünite ve konu kimliğine bağlanması; kritik eşleşmelerin insan tarafından doğrulanması.

### Aşama 2 — Kanonik kazanım kataloğu

**Öncelik: Çok yüksek**

- [ ] Resmî MEB kazanım kodları ve açıklamaları için kontrollü import formatı hazırlamak.
- [ ] `learning_objective_catalog` tablosunu doğrulanmış kazanım verileriyle doldurmak.
- [ ] `objective → topic → unit → subject` ilişkilerini Learning Graph içinde yayınlamak.
- [x] Soru üretiminden gelen her soruyu mümkün olduğunda kanonik `learning_objective_id` ile ilişkilendirmek.
- [x] Kazanım bulunamadığında uydurma kod üretmeyen mevcut güvenlik kuralını korumak.
- [ ] Kazanım sürümleme ve müfredat yılı değişiklik yönetimini eklemek.

**Tamamlanma ölçütü:** Pilot ders/sınıflarda soruların en az `%90`ının doğrulanmış bir kazanıma bağlanması.

### Aşama 3 — Learning Graph içerik genişletmesi

**Öncelik: Yüksek**

- [ ] Ders ve sınıf bazında gerçek ön koşul ilişkilerini küçük uzman paketleriyle hazırlamak.
- [ ] AI tarafından önerilen ilişkiler için uzman inceleme, onay ve red akışını geliştirmek.
- [ ] Graph ilişki sürümü, kaynak, güven düzeyi ve yayın geçmişini görünür hâle getirmek.
- [ ] Döngü, kopuk düğüm ve yanlış sınıf geçişlerini otomatik kontrol eden graph kalite testleri eklemek.
- [ ] Ön koşul açığının Recommendation Engine üzerindeki etkisini ölçmek.

### Aşama 4 — Mastery Engine v2 ve ölçüm kalitesi

**Öncelik: Yüksek**

- [ ] Soru bazında kalıcı `question_id` kullanımını tamamlamak.
- [ ] Soru zorluk değerlerini yalnızca üretim etiketiyle değil gerçek öğrenci performansıyla kalibre etmek.
- [x] Tahmin edilen mastery ile sonraki test başarısını karşılaştıran kalibrasyon raporu oluşturmak.
- [x] Tahmin güveni düşük öğrenciler için daha fazla tanılayıcı soru stratejisi eklemek.
- [x] Retention modelini gerçek tekrar sonuçlarıyla kalibre etmek.
- [ ] Algoritma v1/v2 sonuçlarını yan yana ölçebilecek gölge değerlendirme altyapısı kurmak.
- [ ] Açık uçlu, eşleştirme ve sıralama soruları için güvenilir kısmi puan modelini geliştirmek.

### Aşama 5 — Misconception Engine v2

**Öncelik: Orta-yüksek**

- [ ] Misconception kataloğu için uzman onay ekranı oluşturmak.
- [ ] Aynı kavramsal hatanın farklı ifade ve sorulardaki varyasyonlarını kontrollü alias yapısıyla birleştirmek.
- [ ] Yanılgının giderildiğini gösteren karşı kanıt ve `resolved` yaşam döngüsü eklemek.
- [ ] Yanlış pozitif oranını ders/sınıf/soru türü bazında ölçmek.
- [ ] Doğrulanmış yanılgıya özel kısa açıklama ve düzeltici mikro içerik üretmek.

### Aşama 6 — Recommendation Engine v2

**Öncelik: Yüksek**

- [ ] Önerilerin uygulanma, ertelenme, reddedilme ve tamamlanma durumlarını takip etmek.
- [ ] Öğrencinin öneriyi uyguladıktan sonraki performans artışını ölçmek.
- [ ] Günlük zaman bütçesi, sınav tarihi, öğretmen ödevi ve kurum planını önceliklendirmeye katmak.
- [ ] Aynı anda çok fazla öneri üretmeyi önleyen çeşitlilik ve yük dengeleme kuralları eklemek.
- [ ] Öğretmen ve veli için açıklanabilir öneri özetleri sunmak.
- [ ] Öneri politikalarını kontrollü A/B veya gölge testleriyle karşılaştırmak.

### Aşama 7 — Adaptive Learning v3

**Öncelik: Yüksek**

- [ ] Adaptasyonu yalnızca testin iki bölümü arasında değil soru bazında güvenli biçimde uygulamak.
- [ ] Zorluk kadar soru türü, ipucu, anlatım biçimi ve ön koşul kapsamını da adapte etmek.
- [ ] Öğrencinin sıkışmasını ve gereksiz kolay soruları önleyen güvenlik sınırları eklemek.
- [ ] Adaptif ve standart test gruplarını öğrenme kazanımı açısından karşılaştırmak.
- [ ] Öğretmene adaptif politikanın nedenini ve manuel müdahale seçeneğini göstermek.

### Aşama 8 — Öğrenci, öğretmen, veli ve kurum deneyimleri

**Öncelik: Orta-yüksek**

- [ ] Öğrenci dashboard'unda “Şimdi ne çalışmalıyım ve neden?” alanını merkezi hâle getirmek.
- [ ] Mastery, retention, misconception ve öneri geçmişini sade görsellerle sunmak.
- [ ] Öğretmene sınıf düzeyinde ortak eksikler, ön koşul darboğazları ve müdahale önerileri vermek.
- [ ] Veli ekranında teknik terimlerden arındırılmış gelişim ve destek önerileri göstermek.
- [ ] Kurum ekranına sınıf, şube, öğretmen ve dönem karşılaştırmaları eklemek.
- [ ] Bildirimlerin sıklık, önem ve kullanıcı tercihleriyle yönetilmesini sağlamak.

### Aşama 9 — AI Tutor ve agentic çalışma akışları

**Öncelik: Orta**

- [ ] AI Tutor'u doğrudan Student Learning Profile, Recommendation Engine ve Learning Graph bağlamıyla çalıştırmak.
- [ ] Tutor yanıtlarında öğrenci seviyesine uygun açıklama, kontrollü ipucu ve Socratic yönlendirme politikaları oluşturmak.
- [ ] Öğretmen onayı gerektiren işlemler ile otomatik yapılabilecek işlemleri net biçimde ayırmak.
- [ ] Planlama, içerik seçimi, tekrar takibi ve ilerleme değerlendirmesi için sınırlı yetkili ajanlar geliştirmek.
- [ ] Her ajan kararını kanıt, neden ve sürüm bilgisiyle denetlenebilir kılmak.
- [ ] Yaşa uygunluk, güvenlik, mahremiyet ve pedagojik doğruluk değerlendirmeleri eklemek.

### Aşama 10 — Tahmine dayalı öğrenme ve operasyonel olgunluk

**Öncelik: Orta / sonraki faz**

- [ ] Unutma, konu riski, sınav performansı ve öğrenme tıkanması tahminleri geliştirmek.
- [ ] Model tahminlerini gerçek sonuçlarla sürekli kalibre etmek.
- [ ] Kurumlar arasında veri sızıntısını önleyen tenant izolasyon testlerini otomatikleştirmek.
- [ ] Learning Event, mastery ve recommendation pipeline'ları için alarm, gecikme ve hata dashboard'ları kurmak.
- [ ] Migrasyon geri alma, yeniden hesaplama ve veri kurtarma runbook'larını tamamlamak.
- [ ] Veri saklama süresi, silme talepleri, KVKK ve çocuk verisi politikalarını teknik kontrollerle desteklemek.
- [ ] Maliyet, gecikme ve AI kullanım bütçelerini izlemek.

---

## 7. Önerilen uygulama sırası

Önümüzdeki çalışma sırası aşağıdaki gibi olmalıdır:

1. **Eksik 36 ünitenin tamamlanması ve 108 katalog adayının kontrollü incelenmesi**
2. **Resmî kazanım import pipeline'ı ve pilot kazanım kataloğu**
3. **Soruların kanonik kazanımlara bağlanması**
4. **Learning Graph ön koşul paketlerinin uzman onayıyla genişletilmesi**
5. **Mastery kalibrasyonu ve Recommendation Engine etki ölçümü**
6. **Öğrenci/öğretmen ekranlarında yeni karar katmanlarının görünür hâle getirilmesi**
7. **AI Tutor ve sınırlı yetkili agentic akışlar**
8. **Tahmine dayalı modeller ve kurum ölçeğinde operasyonel olgunluk**

### Yatay teknik katman — Multi‑AI Gateway v3

Bu katman Learning OS aşamalarinin yerine geçmez; içerik üretimi, doğrulama,
tutor ve ajan çağrılarını güvenli ve ölçülebilir hâle getirir. Kanonik sıra:
deterministik/approved content → Mistral primary → OpenAI validator → Claude
premium escalation → Gemini multimodal. Geçiş sağlayıcı bazında toplu değil,
işlem bazında pilot ve geri alınabilir biçimde yapılacaktır. P0 sözleşme, model
kayıt merkezi ve router temeli tamamlandı; sıradaki iş `generate-quiz` için
Mistral adapter ve shadow comparison pipeline'dır.

Bu sıra önemlidir: AI Tutor ve ajanların doğru karar vermesi, önce kanonik müfredat, güvenilir Learning Event ve kalibre edilmiş öğrenci durum modelinin yeterli kapsama ulaşmasına bağlıdır.

---

## 8. Bir sonraki somut sprint önerisi

### Sprint: Katalog Kapsama ve Kazanım Pilot Paketi

**Hedef:** Mevcut test konularını güvenilir müfredat kimliklerine bağlamak ve ilk kanonik kazanım paketini üretmek.

- [ ] Kullanım yoğunluğuna göre ilk 20 katalog adayını incelemek.
- [ ] Bu adayların ihtiyaç duyduğu eksik üniteleri güvenilir kaynaklarla tamamlamak.
- [ ] Bir pilot ders ve sınıf seçerek resmî kazanım listesini kontrollü içe aktarmak.
- [ ] Pilot kazanımları konu ve ünitelere bağlamak.
- [ ] Yeni üretilen sorulara `learning_objective_id` yazmak.
- [ ] Yeni bir testte `quiz_session → learning_event → mastery → profile → recommendation` zincirini uçtan uca doğrulamak.
- [ ] Pilot öncesi ve sonrası katalog eşleşme oranını raporlamak.

**Sprint çıkışı:** Eğitim uzmanının inceleyebileceği gerçek bir konu/kazanım kataloğu, kazanım düzeyinde izlenebilir yeni testler ve ölçülebilir katalog kapsama raporu.

---

## 9. Bilinen riskler

- Kanonik konu ve kazanım eşleştirmeleri yalnızca teknik benzerliğe bırakılırsa pedagojik olarak yanlış birleşmeler oluşabilir.
- Eski soru kayıtlarında kararlı soru kimliği ve resmî kazanım kodu her zaman bulunmuyor.
- `weak_topics` ile yeni mastery sistemi geçiş döneminde farklı sonuçlar gösterebilir; farklar açıklanmalı ve izlenmelidir.
- Az sayıda kanıta sahip öğrenciler için mastery ve misconception sonuçlarının güveni düşüktür.
- Backfill büyük partilerle çalıştırılırsa veritabanı yükü yaratabilir; mevcut sınırlı parti yaklaşımı korunmalıdır.
- AI tarafından üretilen içerik ve graph ilişkileri insan onayı olmadan müfredat gerçeği kabul edilmemelidir.
- Adaptif sistem başarı oranını yükseltirken gerçek öğrenmeyi artırmayabilir; etki sonraki test ve retention sonuçlarıyla ölçülmelidir.
- Canlı dağıtım, veritabanı migrasyonu ve uygulama kodu yayınlarının sırası korunmalıdır.

---

## 10. Nihai hedef

Pratium'un hedef durumu şudur:

> Öğrencinin ne bildiğini, neyi unuttuğunu, hangi kavram yanılgısına sahip olabileceğini, neyi öğrenmeye hazır olduğunu ve sırada ne çalışması gerektiğini sürekli hesaplayan; öğrenci, öğretmen, veli ve kurum için açıklanabilir ve güvenli aksiyonlar üreten bir Learning OS.

Son dört gündeki geliştirmeler bu hedefin veri ve karar omurgasını kurmuştur. Bundan sonraki kritik başarı ölçütü yeni özellik sayısı değil; kanonik müfredat kapsamı, öğrenci modeli doğruluğu ve üretilen önerilerin gerçek öğrenme etkisidir.
