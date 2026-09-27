# Pratium Kurum Entegrasyon API'si — V1 taslağı

**Durum:** İlk salt-okunur dilim kodlandı ve iki migration QuizAI production veritabanına uygulandı. Uygulama kodu henüz deploy edilmedi; canlı partner anahtarı oluşturulmadı. CRM/ERP roster yazma, sınıf endpoint'i ve öğrenme özeti sonraki dilimlerde.

## Amaç

CRM/ERP markasından bağımsız bir Pratium veri sözleşmesi sunmak. Her kurum kendi tenant sınırında kalır; CRM/ERP tarafı Pratium'un iç tablolarına değil bu sürümlü sözleşmeye bağlanır. CRM/ERP farklılıkları kurumun kendi adaptöründe eşlenir.

## Güvenlik varsayılanları

- Tüm istekler HTTPS ve /api/integrations/v1 altında sürümlüdür.
- Her entegrasyon tek bir institution_id değerine bağlı, ayrı iptal/yenileme yapılabilen bir kimliktir. Başka kurum ID'si göndererek kapsam genişletilemez.
- Kimlik bilgisi yalnız sunucuda doğrulanır; saklanan değer geri döndürülemez hash olur, ham secret yalnız oluşturulurken bir kez gösterilir. Üretim Supabase service_role anahtarı asla entegrasyon anahtarı değildir ve istemciye verilmez.
- Her endpoint açık scope ister. Başlangıçta institution:read, classes:read, students:read:pseudonymous, students:read:identity, learning-summary:read, roster:write kapsamları önerilir. PII ve öğrenme özeti kapsamları varsayılan olarak kapalıdır.
- Kurum/öğrenci adları, e-posta, telefon, doğum tarihi, ödeme bilgisi ve cevap bazlı ham geçmiş varsayılan veri setinde yoktur. Öğrenci anahtarı entegrasyon başına kararlı, tahmin edilemez bir dış referans olmalıdır; dahili Supabase kullanıcı ID'si dışarı verilmez.
- Bireysel öğrenme özeti, kurum sözleşmesi ve yetkili veri işleme amacı doğrulanmadan açılmaz. Ham yanıtlar, soru içerikleri ve hassas aile/iletişim verileri V1 kapsamı dışıdır.
- RLS tek savunma değildir: endpoint kimlik doğrulaması, scope kontrolü, tenant filtreleri ve tablo grant/RLS kontrolleri birlikte uygulanır. Tüm erişimler (kurum, entegrasyon, scope, istek, sonuç, zaman) denetim kaydına yazılır; token/secret ve öğrenci içeriği loglanmaz.
- İstek başına sayfalama, sınırlandırılmış gövde boyutu, rate limit, idempotency ve cursor tabanlı artımlı senkronizasyon uygulanır. Yanıtlar Cache-Control: no-store taşır.

## Önerilen V1 kaynakları

| Yön | Kaynak | Scope | V1 davranışı |
|---|---|---|---|
| Pratium → CRM/ERP | GET /institution | institution:read | Kurumun entegrasyon için gerekli temel tanımı; ticari/özel ayarlar hariç |
| Pratium → CRM/ERP | GET /students | students:read:pseudonymous | İlk kod diliminde var: takma adlı referans, sınıf düzeyi ve üyelik başlangıcı; kimlik alanı yok |
| Pratium → CRM/ERP | GET /classes | classes:read | Sonraki dilim: sınıf/öğretmen ilişkisi veri modeli doğrulanınca |
| Pratium → CRM/ERP | GET /students/{studentRef}/learning-summary | learning-summary:read | Sonraki dilim: sözleşme ve alan kapsamı onaylandıktan sonra |
| CRM/ERP → Pratium | POST /roster-sync | roster:write | Sonraki dilim: staging, idempotency ve kurum yöneticisi onayıyla |

Artımlı okuma opaque cursor ile ilerler; sunucu cursor'ı imzalar ve tenant'a bağlar. limit üst sınırı 100'dür. Yazma istekleri Idempotency-Key ister. Bilinmeyen alanlar yok sayılmaz; şema doğrulamasında reddedilir. Pratium'un öğrenme/test verisi CRM/ERP yazmalarıyla değiştirilemez.

## Standart cevaplar

Başarılı liste cevabı { "data": [], "next_cursor": null, "request_id": "..." } biçimindedir. Hatalar { "error": { "code": "...", "message": "...", "request_id": "..." } } döner. 401 geçersiz kimlik, 403 eksik scope veya tenant yetkisi, 409 eşleştirme çakışması, 422 şema doğrulama, 429 rate limit anlamına gelir. Hata cevabı başka tenant'ın varlığını ifşa etmez.

## CRM/ERP eşleştirme ve çakışma politikası

- Her kaynak sistem source_system ve external_id gönderir; eşsizlik bu ikiliyi kurum içinde tanımlar.
- İlk eşleştirme salt-okunur önizleme verir. Belirsiz eşleşme otomatik birleştirilmez; yetkili kurum kullanıcısı inceler.
- Güncelleme/silme için kaynak sistemin updated_at/değişiklik sıra numarası ve idempotency anahtarı gerekir. Eski kayıt yeni veriyi ezemez.
- Öğrenci hesabı oluşturma, davet/aktivasyon ve kişisel alan aktarımı ayrı onaylı işlemlerdir; roster senkronu kendi başına hesap açmaz.
- Silme/ayrılma olayları önce inactive/tombstone olarak senkronize edilir; yasal saklama ve hesap silme politikasını otomatik aşmaz.

## Uygulamaya geçiş kapıları

1. Kurum/partner veri paylaşım sözleşmesi, rol ve hukuki dayanak; hangi öğrenci alanlarının hangi amaçla aktarılacağı.
2. V1 yönü: yalnız Pratium'dan okuma mı, yoksa roster yazma da dahil mi? Taslakta ikisi de var, ancak yazma başlangıçta staging/onaylıdır.
3. Kimlik stratejisi: OAuth 2.1 Client Credentials (tercih edilen; desteklenen dağıtım biçimi doğrulanmalı) veya hash'li, döndürülebilir kuruma özel API key. İnsan kullanıcı oturum tokenı partner entegrasyonu için kullanılmamalıdır.
4. DB migration, servis tarafı doğrulama, audit, rate limit, OpenAPI tabanlı sözleşme testleri ve staging kurumunda uçtan uca test.
5. Sınırlı pilotta veri minimizasyonu ve tenant izolasyonu doğrulanmadan production credential üretmemek.

## Durum ve mevcut uygulamayla ilişki

Pratium'daki /api/institution/* endpoint'leri mevcut kurum arayüzünün iç kullanımına aittir; partner API olarak yeniden kullanılamaz. Bu taslak onlara dokunmaz. Ekteki OpenAPI belgesi henüz çalışan endpoint garantisi vermez; implementasyon ve migration ayrıca yapılmalıdır.

## Uygulanan ilk kod dilimi

- POST /api/institution/integrations — kurum yöneticisi oturumuyla, yalnız seçtiği kurum için entegrasyon anahtarı oluşturur. Anahtar bir kez gösterilir; yalnız SHA-256 hash saklanır. İlk izin kümesi sadece institution:read ve students:read:pseudonymous değerlerini kabul eder; varsayılan bitiş 90 gün, üst sınır 1 yıldır.
- DELETE /api/institution/integrations — aynı kurumun yöneticisi entegrasyon kimliğini iptal eder.
- GET /api/integrations/v1/institution — token'daki kurumun adını ve o entegrasyona özel opak kurum referansını verir.
- GET /api/integrations/v1/students — dahili kullanıcı ID'si, ad, e-posta, okul numarası ve ham cevaplar olmadan öğrenci takma adı, sınıf düzeyi ve üyelik başlangıcını sayfalı verir.
- Token başına dakikada 120 çağrılık atomik limit, tenant/scope doğrulaması, imzalı cursor, no-store cevap başlığı ve audit kaydı eklendi.

Entegrasyon yönetimi kurum panelindeki /institution/integrations sayfasına eklendi. Kodun production'da çalışması için uygulama deploy'u ve kurum yöneticisiyle staging/production smoke testi gerekir. Bağlı staging Supabase projesinde temel kurum tabloları bulunmadığından migration orada uygulanmadı.

