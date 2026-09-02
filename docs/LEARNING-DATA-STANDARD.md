# Pratium Learning Data Standard — Faz 1

Bu faz, mevcut `quiz_sessions` ve `weak_topics` davranışını kaldırmadan iki
yeni katman ekler:

- `learning_events`: Öğrencinin soru bazındaki ham ve değişmez öğrenme kanıtı.
- `student_mastery`: Bu kanıttan tekrar üretilebilen güncel öğrenci durumu.
- `student_learning_profiles`: Mastery ve event kanıtından otomatik türeyen,
  PII içermeyen merkezi akademik profil.

## Student Learning Profile v1

Her mastery güncellemesinden sonra profil otomatik yenilenir. Profil; güçlü,
zayıf ve tekrar zamanı gelmiş konuları, ders özetlerini, bilinen misconception
kimliklerini, genel trendi ve kanıta dayalı öğrenme hızını içerir. Henüz ölçümü
olmayan “tercih edilen anlatım biçimi” gibi alanlar tahmin edilmez.

## Veri akışı

1. İstemci testi mevcut `/api/save-quiz` yoluyla kaydeder.
2. Test oturumu tamamlandıktan sonra sunucu `record_quiz_learning_events`
   fonksiyonunu çağırır.
3. Fonksiyon `quiz_sessions.questions` ve `answers` dizilerini sıra numarasıyla
   eşler, her soru için bir olay üretir.
4. `(student, source, session, question_index)` benzersizliği tekrar gönderilen
   aynı testin ikinci kez sayılmasını önler.
5. Aynı transaction içinde ilgili konu için Mastery Engine v1 yeniden hesaplanır.
6. Ortak `getTopicMastery` okuyucusu yeni tabloyu tercih eder ve migration'ın
   bulunmadığı ya da henüz olay oluşmamış ortamlarda `weak_topics`a geri döner.
   Doğrudan eski tabloyu okuyan raporlar kontrollü şekilde daha sonra taşınır.

## Mastery Engine v1

- Skor: zorluk ağırlıklı doğruluk ve 3 sanal denemelik `%60` Bayesian öncül.
- Güven: `1 - exp(-attempt_count / 8)`; az veride düşük kalır.
- Retention: son çalışmadan beri geçen süreye ve mastery seviyesine bağlı
  açıklanabilir üstel azalma.
- Trend: son 30 gün ile önceki 30 gün doğruluk oranı arasında 10 puandan büyük
  fark varsa `improving` veya `declining`, aksi halde `stable`.
- `algorithm_version = v1`, ileride geriye dönük yeniden hesaplamayı mümkün kılar.
- Saklanan `retention_score` son mastery güncellemesindeki snapshot'tır. Ortak
  okuyucu unutma riskini `last_practiced_at` üzerinden istek anında tekrar
  hesaplar; doğrudan tablo okuyacak ileriki tüketiciler aynı kuralı uygulamalıdır.

## Kurulum ve yayın sırası

1. Önce `scripts/012_learning_events_mastery_v1.sql` migration'ını staging'de
   çalıştırın.
2. Aynı örnek test oturumunda RPC'yi iki kez çağırın. İlk çağrı soru sayısı kadar,
   ikinci çağrı `0` yeni olay döndürmelidir.
3. Olay toplamı, cevap toplamı ve mastery sayaçlarını karşılaştırın.
4. RLS ile bir öğrencinin başka öğrencinin satırlarını okuyamadığını doğrulayın.
5. Sonra uygulama kodunu yayınlayın. Kod migration henüz yoksa testi yine
   kaydeder; yalnızca yeni projeksiyonu loglayıp atlar.

## Bilinen sınırlar ve sonraki migration'lar

- Mevcut sorularda kararlı `question_id` ve MEB kazanım kodu her zaman yoktur.
  Bu nedenle v1 konu düzeyinde çalışır; alanlar gelecekteki taksonomi için hazırdır.
- `institution_id`, `class_id`, `assignment_id`, ipucu ve misconception alanları
  mevcut quiz payload'ında bulunmadığında boş kalır.
- Quiz üretimi her soruya sunucu tarafından doğrulanmış `subject` ve o adaptif
  parçanın gerçek `resolvedDifficulty` değerini yazar. Böylece farklı zorlukta
  iki parça içeren tek oturum doğru ağırlıklarla eventlere dönüşür.
- Mevcut `curriculum` modeli yalnızca konu adı dizileri tutar; güvenilir MEB
  kazanım kodu bulunmadığı için `learning_objective_id` uydurulmaz ve boş kalır.
- Geçmiş oturumlar otomatik backfill edilmez. Ayrı, gözlemlenebilir ve parti
  bazlı bir backfill yapılmalıdır; canlı migration içinde uzun tarama yapılmaz.
- `weak_topics` tekrar kayıtta çift sayılmaya açıktır. Yeni veri idempotenttir;
  eski tablo kaldırılmadan önce okuyucular `student_mastery`ye taşınmalıdır.
- Canlı veritabanı şeması bu repoda tam migration geçmişi olarak tutulmuyor.
  UUID foreign key'leri ve `quiz_sessions` kolonları staging şemasıyla
  doğrulanmadan production'a uygulanmamalıdır.

## Aşama 0.5 — Historical Data Migration & Taxonomy Normalization

Ana roadmap'teki **Sprint 0.4 — Backfill Strategy**, uygulanabilir bir teslimat
olarak bu aşamada tamamlanır:

1. Konu adları boşluk ve harf büyüklüğünden bağımsız bir alias anahtarıyla
   eşleştirilir; anlamsal olarak farklı konular otomatik birleştirilmez.
2. Ders eşlemesi yalnızca açık veya incelenmiş alias kayıtlarından alınır.
3. Eski `quiz_sessions` satırları küçük partiler hâlinde `learning_events`e
   aktarılır; kaynak test ve cevap JSON'u değiştirilmez.
4. Event benzersizlik kısıtı yeniden çalıştırmayı güvenli kılar.
5. Tarihsel olayların `occurred_at` değeri testin `created_at` zamanıdır;
   aktarım zamanı değildir.
6. Backfill sonrasında mastery, learning profile ve recommendation türetilmiş
   verileri olay günlüğünden yeniden hesaplanır.
7. Her parti; beklenen soru sayısı, üretilen event sayısı, doğru/yanlış toplamı
   ve eşleşmeyen oturumlar açısından doğrulanır.

Uygulama: `scripts/019_historical_learning_event_backfill_taxonomy.sql`.
Taksonomi tablosundaki `candidate` kayıtlar içerik ekibi onayı olmadan müfredat
otoritesi olarak kabul edilmemelidir.
