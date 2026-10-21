# Pratium — Güvenlik, Eksiklik ve Geliştirme Raporu (Son Durum: 20 Ekim 2026)

> **Not:** 19 Ekim tarihli ilk rapor (aşağıda Bölüm 1–5, değiştirilmeden) önceki PR'larda yalnızca durum tablosuna indirgenmişti. Bu sürümde tam metin geri getirildi; başa kapanış karşılaştırması (Bölüm A), sizin yapmanız gerekenler (Bölüm B) ve bilinçli bırakılanlar (Bölüm C) eklendi.
> Simgeler: ✅ kapandı · 🟡 kısmen kapandı / en iyi çaba · ⚪ bilinçli bırakıldı · 🔴 açık · 👤 sizin işleminiz.

## A. Kapanış karşılaştırması (PR #79–#84, hepsi `main`'de ve production'da)

### A.1 Veritabanı bulguları
| ID | Başlangıç | Son durum | Kapatan |
|---|---|---|---|
| D1 `api_rate_limits` herkese açık | Yüksek | ✅ Politika `service_role`'e daraltıldı, `anon`/`authenticated` yetkisi kaldırıldı; `bot`/`chat` atomik sınırlayıcıya geçti | #79 |
| D2 `live_quiz_answers` herkese açık | Orta | ✅ Politika kaldırıldı/daraltıldı | #79, #80 |
| D3 `class_members`/`classes`/`challenge_attempts` herkese açık | Orta | ✅ Politikalar sahibe/üyeye daraltıldı | #79 |
| D4 `anon` ~65 tabloda yetkili | Orta | ✅ Toplu `REVOKE`, gerekenlere tek tek `GRANT`, varsayılan yetkiler kapatıldı | #82 (canlı SQL) |
| D5 `institutions` / kuruma katılım | Orta | ✅ Hassas sütunlar kısıtlandı; katılım yalnız sunucu rotasından, token zorunlu | #82 |
| D6 `profiles.seller_id` | Düşük | ✅ Bir kez atanabilir | #82 |
| D7 RLS açık, politika yok (24 tablo) | Bilgi | ⚪ Beklenen davranış, işlem gerekmedi | — |
| D8 Kova MIME/boyut sınırı | Bilgi | ✅ Sınırlar eklendi | #82 |
| D9 (yeni) `live_quizzes` doğru cevap sızıntısı | Orta | ✅ Kapsam daraltıldı; doğru cevaplar `live_quiz_keys` tablosuna taşındı, eski sorulardan `ans`/`exp` temizlendi | #80, #83 |

### A.2 API ve uygulama bulguları
| ID | Başlangıç | Son durum | Kapatan |
|---|---|---|---|
| A1 `institution/join` oturumsuz | Yüksek | ✅ Token zorunlu, `user_id` gövdeden alınmıyor | #79, #82 |
| A2 `report?type=teacher` | Yüksek | ✅ `approved` + sınıf sahipliği (`lib/teacher-scope.ts`) + negatif testler | #80 |
| A3 `buildTeacherContext` / `teacher/reports` | Yüksek | ✅ Sahiplik doğrulaması + negatif testler | #80 |
| A4 `/api/bot` sınırsız vekil | Yüksek | 🟡 Mesaj sayısı/uzunluk/rol sınırı ve atomik sınır var; misafir IP sınırı ve sunucu tarafı sistem istemi yok (⚪ bkz. C) | #79 |
| A5 Açık yönlendirme | Yüksek | ✅ Ortak `safeNextPath` (callback + 4 sayfa) | #79 |
| A6 Cron `Bearer undefined` | Orta | ✅ Ortak `isCronAuthorized` (secret yoksa reddeder, `timingSafeEqual`) | #79 |
| A7 Canlı sınav kuralları | Orta | ✅ Üyelik, aktif durum, indeks, tek cevap, onaylı öğretmen | #80 |
| A8 `learning-risk/actions` | Orta | ✅ `classroom_id` zorunlu, sahiplik + üyelik | #80 |
| A9 Push SSRF | Orta | ✅ https + bilinen push servisleri izin listesi | #81 |
| A10 `extract-file` | Orta | ✅ Parça/toplam sınır, TTL, uzantı izin listesi, hız sınırı | #81 |
| A11 Paralı AI/e-posta hız sınırları | Orta | 🟡 İlgili uçlara atomik sınır eklendi; `topic-summary`, `check-answer` eski sınırlayıcıda (⚪ bkz. C) | #81 |
| A12 `coaching-leads` | Orta | ✅ IP sınırı, uzunluk ve biçim doğrulaması (`lib/lead-validation.ts`) | #81 |
| A13 `identity/resolve` / roster | Orta | 🟡 Dizi sınırı + hız sınırı + rol gizleme; ilişki kısıtı yok (⚪ bkz. C) | #81 |
| A14 Güvenlik başlıkları | Orta | 🟡 X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy aktif; CSP yalnızca **Report-Only** | #81 |
| A15 `Math.random` şifre/kod | Düşük | ✅ `crypto.randomInt` | #81 |
| A16 `error.message` sızıntısı | Düşük | ✅ Genel mesaj, ayrıntı sunucu logunda | #82 |
| A17 `role` izin listesi | Düşük | ✅ | #81 |
| A18 `updateIdentity` sütun izin listesi | Düşük | ✅ `UPDATABLE_IDENTITY_FIELDS` | #81 |
| A19 Dahili fetch kökü | Düşük | ✅ `internalOrigin` izin listesi | #84 |
| A20 Oturumsuz uçlarda IP sınırı | Düşük | ✅ Uygulama içi en iyi çaba sınırı (#84) + 21 Ekim'de Vercel Firewall hız sınırı kuralı (kalıcı koruma) | #84, Firewall |
| A21 `integrations/v1/students` | Düşük | ✅ | #81 |
| A22 PayTR eksik ödeme | Düşük | ✅ İmzalı tutar kayıtlı fiyatın altındaysa reddedilir | #84 |
| A23 PII günlükleri | Düşük | ✅ | #84 |
| A24 Yükleme uzantısı | Düşük | ✅ | #81 |
| A25 `reading/upload` `..` | Düşük | ✅ | #81 |
| A26 Notlama istemi enjeksiyonu | Düşük | ✅ Öğrenci cevabı "yalnızca veri" olarak çerçevelendi, `"""` etkisizleştirildi | #84 |
| Bağımlılık: `source-map-js` (npm audit) | Yüksek (yalnız derleme) | 🔴 Bu turlarda `npm audit fix` uygulanıp doğrulanmadı | — |

### A.3 Bölüm 4 (güvenlik dışı) maddeleri
| # | Madde | Son durum |
|---|---|---|
| 1 | `migrate-production` işi `main`'de başarısız | 🔴 Açık (önceden beri; bu PR'lardan bağımsız, şema değişiklikleri MCP ile uygulandı) |
| 2 | CI'da eslint yok | 🔴 Açık |
| 3 | Dağınık hız sınırı | 🟡 Yeni uçlar `checkRateLimit`'te; 2 rota eski kodda |
| 4 | Ortak yardımcılar | ✅ `safe-next`, `cron-auth`, `teacher-scope`, `live-quiz-rules`, `push-endpoint`, `lead-validation`, `internal-origin`, `ip-throttle` |
| 5 | Ortak hata sarmalayıcı | 🟡 Mesaj sızıntıları temizlendi, ortak sarmalayıcı yazılmadı |
| 6 | `CRON_SECRET`, `TR_IDENTITY_DB_CA/VERIFY` varlığı | ✅ 21 Ekim: `CRON_SECRET` tanımlı (cron'lar 200); `TR_IDENTITY_DB_CA`, `TR_IDENTITY_DB_SSL_SERVERNAME` tanımlandı |
| 7 | Kimlik DB TLS doğrulaması | ✅ 21 Ekim: sertifika `TR_IDENTITY_DB_CA` ile sabitlendi, bağlantı IP ile yapılırken adı `TR_IDENTITY_DB_SSL_SERVERNAME=identity.pratium.com.tr` ile doğrulanıyor (PR #88). Doğrulama: yeni deploy'da profil kaydı 200, TR-PG `identities.updated_at` aynı saniyede güncellendi, "doğrulanmıyor" uyarısı kalmadı |
| 8 | TR-PG konum SQL'i | ✅ 21 Ekim: `postal_code`, `address_line` sütunları kurulu ve yazma çalışıyor |
| 9 | 816 kazanımsız onaylı soru | 👤 Kazanım Eşleştirme incelemesi bekliyor |
| 10 | Mistral Small fiyatı | 👤 Doğrulanmadı |
| 11 | KVKK veri envanteri / saklama süreleri | 🔴 Açık |
| 12 | Konum zorunluluğu öğretmen/kurum için | 🔴 Karar bekliyor (öğrenciler için tamam) |
| 13 | Admin sayfa kabuğunu `proxy.ts`'te korumak | 🔴 Açık (sunucu rotaları zaten kontrol ediyor) |
| 14 | Negatif yetki testleri | ✅ A2/A3/A8 ve canlı sınav için eklendi |
| 15 | Anormal kullanım / maliyet uyarıları | 🔴 Açık |

## B. 👤 Sizin yapmanız gerekenler
1. ~~**VPS (TR-PG):** `docs/TR-PG-konum-alanlari.sql`~~ ✅ Yapıldı (21 Ekim, sütunlar doğrulandı).
2. ~~**Vercel ortam değişkenleri:**~~ ✅ Tamamlandı (21 Ekim): `CRON_SECRET`, `TR_IDENTITY_DB_CA`, `TR_IDENTITY_DB_SSL_SERVERNAME` Production'da. Notlar: `TR_IDENTITY_DB_URL` ve `TR_IDENTITY_DB_SSL` yalnızca Production'da, Preview'da kimlik bağlantısı yok. `TR_IDENTITY_DB_URL` host'u IP (`identity.pratium.com.tr` adı Natro DNS'inde çözümlenmediği için kullanılmıyor). Veritabanı kullanıcı şifresi değişmiş olabilir; yeni şifreyi şifre yöneticinizde saklayın. Natro'ya açılan DNS talebi (#3249126) ana alan adı kaydını değiştirmiş olabileceğinden geri alma talebi yazıldı; `pratium.com.tr` ve `www.pratium.com.tr` kaydının `89.19.30.73` olduğunu doğrulayın (`nslookup`).
3. ~~**Vercel Firewall:**~~ ✅ 21 Ekim: "Oturumsuz uçlar hız sınırı" kuralı yayınlandı. `^/api/(coaching-leads|resolve-seller-code|referral/referrer-name|institution/lookup|bot)$` yolları için IP başına 60 saniyede 30 istek, aşılınca 429 (Fixed Window). Yeniden deploy gerektirmez; sorun çıkarsa kural Firewall → Rules'tan kapatılabilir.
4. **CSP'yi zorlamaya geçirme kararı:** Report-Only raporlarında ihlal görülmeyince `Content-Security-Policy` başlığına çevrilmesini onaylayın.
5. **Supabase Auth paneli:** Sızdırılmış parola koruması, MFA, e-posta onayı ve oturum süreleri bu incelemede kontrol edilemedi; panelden bakın.
6. **Kazanım Eşleştirme incelemesi:** 816 onaylı sorunun eşleştirmesini yönetici panelinden inceleyin.
7. **Kararlar:** 9 seçmeli lise dersi; Mistral Small fiyatının doğrulanması; konum zorunluluğunun öğretmen/kurum kayıtlarına uygulanıp uygulanmayacağı.
8. **Altyapı:** `migrate-production` işini onarın (`supabase migration repair`) veya kaldırın; isterseniz eslint kapısı için onay verin.
9. **`npm audit fix`** (`source-map-js`) için onay verirseniz uygularım.

## C. ⚪ Bilinçli olarak bırakılanlar (gerekçeli)
- **CSP Report-Only:** Zorlanan CSP; KaTeX, Google OAuth, PayTR iframe ve Supabase ile canlı sayfayı bozabilir. Önce rapor toplanır.
- **IP sınırı en iyi çaba:** Uygulama içi sınır örnek başınadır; kalıcı koruma olarak Vercel Firewall kuralı eklendi (B.3).
- **`/api/bot` misafir IP sınırı ve sunucu tarafı sistem istemi:** İstemci `system` gönderiyor (uzunluk sınırlı); sistem isteminin sunucuya alınması istemci davranışını değiştirir, ayrı geliştirme.
- **`identity/resolve` ilişki kısıtı:** Genel liderlik tablosu herkesin adını göstermek zorunda olduğundan ilişkiye bağlamak ürünü bozar; yalnızca dizi/hız sınırı ve rol gizleme uygulandı. Tasarım kararı gerekir.
- **Roster'da `plan` rozeti ve sınıf arkadaşı kimlikleri:** Ürün özelliği olarak korunuyor.
- **`topic-summary`, `check-answer` eski sınırlayıcıda:** Tablo artık yalnız servis rolüne açık olduğundan istismar edilemez; atomik sınırlayıcıya geçiş düşük öncelikli.
- **`migrate-production`, eslint kapısı:** Altyapı işi, güvenlik düzeltmelerinden bağımsız.

## D. 21 Ekim'de çıkan ek bulgu ve düzeltmeler
- **Profil düzenleme kaydı tutmuyordu (düzeltildi, PR #86):** İstemci `profiles` yazımları `upsert` kullanıyor; PostgREST bunu `ON CONFLICT DO UPDATE SET id = EXCLUDED.id ...` olarak üretir ve `id` sütununda UPDATE yetkisi ister. 4 Ekim'deki sütun düzeyi yetki listesinde (`20261004112943`) `id` yoktu; Supabase loglarında `POST /rest/v1/profiles` 403 ("permission denied for table profiles") görüldü. Mevcut bir profilin sınıf, okul, cinsiyet ve dil değişiklikleri kaydedilmiyor, sayfa hatayı yok sayıp "kaydedildi" gösteriyordu. Çözüm: `GRANT UPDATE (id) ON public.profiles TO authenticated` (`20261021120000`); RLS `auth.uid() = id` başka satıra geçişi engeller, rollback'li denemeyle doğrulandı. Profil sayfası artık hatayı gösteriyor. Başlangıç tarihi 24 saatlik log penceresinden kesin belirlenemedi.
- **Dağıtım notu:** `Instant Rollback` sonrası Vercel otomatik yayını kapatabilir; yeni bir Production deploy'u Promote edildikten sonra yeniden çalıştığı doğrulandı.

---

# Ek: İlk rapor (19 Ekim 2026, değiştirilmeden)
**Tarih:** 19 Ekim 2026 · **Kapsam:** `main` (b9e04b7 sonrası), canlı Supabase projesi `cnkpexqyhjfgrhnkxitj`, 211 API rotası, veritabanı politikaları ve yetkileri, bağımlılıklar, yapılandırma.
**Yöntem:** (1) Canlı veritabanında salt okunur SQL (rol benzetimli denemeler `rollback` ile geri alındı, hiçbir veri değişmedi); (2) 211 rotanın otomatik sınıflandırması ve elle okuma; (3) iki bağımsız kod incelemesi (yetkilendirme ve enjeksiyon/girdi işleme) — kritik bulguları ben tekrar kod üzerinde doğruladım; (4) `npm audit`, gizli anahtar taraması, başlık/CORS kontrolü.
**Sınırlar:** Canlı sistemde sızma testi yapılmadı. 211 rotanın tamamı satır satır okunmadı (öncelikli ve örneklenen rotalar okundu). Vercel/Supabase panel ayarları (Auth: sızdırılmış parola koruması, MFA, e-posta onayı, oturum süreleri), VPS'teki kimlik veritabanı ve yedekler incelenmedi. Aşağıdaki "Doğrulandı" ibaresi, kodu/veriyi benim okuduğum veya çalıştırdığım anlamına gelir; "Doğrulanmadı" olanlar alt incelemenin bulgusudur.

---

## 1. Özet

Genel tablo **iyi bir temel + birkaç ciddi, kolay kapanabilir açık**: 137 tablonun tamamında RLS açık, `SECURITY DEFINER` fonksiyonların hiçbiri `anon`/`authenticated` tarafından çağrılamıyor, görünümler `security_invoker`, `profiles`/`teachers` için sütun düzeyi yetki kısıtı var, ödeme geri çağrısı HMAC + `timingSafeEqual` + idempotent, partner API anahtarları karma ile saklanıyor ve hız sınırı/denetim kaydı var, yönetici rotalarının hepsi sunucuda `is_admin` kontrolü yapıyor, SVG yalnızca `<img data:>` olarak gösteriliyor, KaTeX `trust:false`.

En acil **8 madde** (hepsi doğrulandı):

| # | Bulgu | Önem |
|---|---|---|
| 1 | `api_rate_limits` tablosunda `public` rolüne tam yetkili politika: oturumsuz herkes okuyabilir/değiştirebilir | **Yüksek** |
| 2 | `/api/institution/join` oturumsuz çağrılabiliyor: herhangi bir kullanıcı UUID'si herhangi bir kuruma yazılabiliyor | **Yüksek** |
| 3 | `/api/report?type=teacher`: herhangi bir `teachers` kaydı (onaysız bile) başka sınıfın öğrenci verisini okuyor | **Yüksek** |
| 4 | `buildTeacherContext`/`teacher/reports`: istemciden gelen `classroomId` öğretmenin sınıflarına karşı doğrulanmıyor | **Yüksek** |
| 5 | `/api/bot`: oturumsuz, sınırsız Claude vekili; `system` istemciden geliyor | **Yüksek** (maliyet/kötüye kullanım) |
| 6 | OAuth callback ve istemci sayfalarında açık yönlendirme (`/\evil.com`) | **Yüksek** (kimlik avı) |
| 7 | `live_quiz_answers` oturumsuz okunabiliyor + canlı sınavda doğru cevap anında dönüyor ve üyelik/durum kontrolü yok | **Orta-Yüksek** |
| 8 | Cron rotaları `CRON_SECRET` tanımsızsa `Bearer undefined` ile açılıyor (12 rota) | **Orta** |

---

## 2. Bulgular — Veritabanı (Doğrulandı: canlı DB)

| ID | Önem | Bulgu ve kanıt | Öneri |
|---|---|---|---|
| D1 | **Yüksek** | `api_rate_limits`: politika "Service role manages rate limits" rolü `{public}`, ALL, `true/true`. `anon` rolüyle **175 satır okundu ve UPDATE çalıştı** (geri alındı). Sınırı sıfırlama, başkasının sınırını doldurma, satır silme mümkün. `/api/bot` ve `/api/chat` sınırı bu tabloya dayanıyor. | Politikayı sil (service role RLS'i zaten aşar); `REVOKE ALL ... FROM anon, authenticated`; `bot`/`chat`'i `lib/rate-limit.ts` (atomik RPC) üzerine taşı. |
| D2 | Orta | `live_quiz_answers` `public` SELECT `true`: `anon` rolüyle **107 satır** (user_id, seçilen cevap, doğru/yanlış, süre) okundu. Gizlilik sızıntısı + canlı yarışta hile. | Politikayı kaldır; sonuçları API'den (sınıf üyeliğiyle) sun. |
| D3 | Orta | `class_members`, `classes` (davet kodu dahil), `challenge_attempts` için `public` SELECT `true` politikaları var. Şu an tablolar boş (0 satır görüldü) ama veri girdiği anda herkese açık olur. | Politikaları kaldır veya sahibiyle sınırla; kullanılmıyorsa tabloları sil. |
| D4 | Orta | `anon` rolünün **~65 tabloda** SELECT/INSERT/UPDATE/DELETE yetkisi var (Supabase varsayılan yetkileri); koruma yalnızca RLS politikalarına bağlı. D1–D3 bunun sonucu. | `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon`; yalnızca gerçekten oturumsuz okunması gereken tablolara (ör. `ab_tests`, `topic_prerequisites`) tek tek `GRANT SELECT`. Varsayılan yetkileri `ALTER DEFAULT PRIVILEGES` ile kapat. |
| D5 | Orta | `institution_users` INSERT politikası yalnızca `user_id = auth.uid()` ve `role='student'` istiyor; **kurum kodu kontrolü veritabanında yok**. `institutions` tablosu tüm giriş yapmış kullanıcılara açık (`code`, `admin_email`, `discount_rate`, `seller_id` dahil). Bir kullanıcı kod olmadan istediği kuruma kendini ekleyebilir. | `institutions` SELECT'ini sütun düzeyinde kısıtla (kod/e-posta/indirim/satıcı hariç) veya görünüm kullan; kuruma katılımı yalnızca sunucu rotasından yap, doğrudan INSERT yetkisini kaldır. |
| D6 | Düşük | `profiles.seller_id` sahibi tarafından güncellenebiliyor (sütun yetkisi verilmiş): satıcı/komisyon atfı manipüle edilebilir. `profiles.role` student/parent/teacher arasında değiştirilebilir (yetkilendirme `teachers.approved` ile yapıldığı için doğrudan sömürü görülmedi). | `seller_id` UPDATE yetkisini kaldır, atfı sunucu rotasından yap. |
| D7 | Bilgi | 24 tabloda RLS açık, politika yok (tam reddet — beklenen, Supabase INFO). Güvenlik danışmanından başka bulgu çıkmadı. | Gerek yok; yalnızca belgeleyin. |
| D8 | Bilgi | `avatars` kovası herkese açık; MIME/boyut sınırı yok (`allowed_mime_types=null`, `file_size_limit=null`). `meb-resources`, `teacher-documents`, `reading-uploads` kovalarında da sınır yok (yalnızca `publication-evidence`'ta var). | Kovalara MIME listesi ve boyut sınırı koy; avatarlarda `image/png|jpeg|webp`. |

**Olumlu (doğrulandı):** `SECURITY DEFINER` + anon/authenticated çalıştırılabilir fonksiyon: **0**. Tüm görünümler `security_invoker=true` (biri — `misconception_false_positive_summary` — `reloptions` boş, ama `authenticated` SELECT yetkisi yok). `profiles`: `anon` yetkisi yok, `authenticated` yalnızca güvenli sütunlara UPDATE yapabiliyor; `is_admin`, `plan` vb. değiştirilemez. `teachers`: `approved`/`question_bank_editor` kendi kendine verilemez. `parent_children` INSERT yalnızca sunucudan.

---

## 3. Bulgular — API ve uygulama (kod)

### Yüksek
| ID | Bulgu | Dosya | Durum | Öneri |
|---|---|---|---|---|
| A1 | `institution/join` token yoksa `user_id`'yi gövdeden alıp servis rolüyle `institution_users` yazıyor; kurumdaki tek-kurum kuralı yüzünden kurban gerçek kurumuna katılamaz. Önkoşul: kurum kodu + kurban UUID'si. | `app/api/institution/join/route.ts:11-30` | Doğrulandı | Token'ı zorunlu yap, `user.id === user_id` şartı ya da `user_id`'yi gövdeden hiç alma. Kayıt akışı için e-posta onayı sonrası çağrılsın. |
| A2 | `type=teacher` raporunda yalnızca `teachers` kaydı aranıyor (`approved` yok); `classId` sorgudan alınıp sınıf sahibiyle karşılaştırılmıyor. Başka kurumun öğrenci adı, sınıfı, serisi, istatistiği ve `answers` ham sütunu döner. | `app/api/report/route.ts:178-200` | Doğrulandı | `approved` şartı + `classrooms.teacher_id = teacher.id` doğrulaması (403). |
| A3 | `buildTeacherContext` istemciden gelen `classroomId`'yi sahiplik doğrulamadan roster sorgusuna veriyor (öğretmenin en az bir sınıfı varsa geçerli); `teacher/reports` aynı hata. Learning-evidence/gain/verified-learning bu kontrolü kendi başına yapıyor. | `lib/report-context.ts:79-92`, `app/api/teacher/reports/route.ts:46` | Doğrulandı (context); reports kodunu ajan raporladı | `buildTeacherContext` içinde `classroomId` sahipliğini doğrula (`classrooms.some`), değilse `null`. |
| A4 | `/api/bot`: Bearer yoksa hiçbir sınır uygulanmıyor; `system` ve `messages` istemciden alınıp doğrudan Anthropic'e gidiyor (uzunluk/rol/adet kontrolü yok). Oturumlu sınır da okuma-sonra-yazma, hata durumunda **sınırsız** (`catch {}`) ve D1 nedeniyle manipüle edilebilir. | `app/api/bot/route.ts:15-52` | Doğrulandı | İstemci `system`'ini yok say; ≤10 mesaj/≤1000 karakter; yalnız `user`/`assistant`; IP başına sınır; `checkRateLimit` (atomik, hatada kapalı). `chat` rotasında aynı model. |
| A5 | Açık yönlendirme: `next` doğrulaması `startsWith('/') && !startsWith('//')`; `/\evil.com` geçiyor (`new URL('/\\evil.com','https://a.com')` → `https://evil.com/`). Callback `code` olmadan da yönlendiriyor → oturumsuz kimlik avı bağlantısı. Aynı zayıf kontrol 4 istemci sayfasında kopyalanmış. | `app/auth/callback/route.ts:11-14,115`; `profile/page.tsx:33`; `(auth)/register/page.tsx:71`; `(auth)/login/student/page.tsx:13` | Doğrulandı (callback + node denemesi) | Ortak `safeNextPath()` yardımcı fonksiyonu: `/^\/(?![\/\\])[^\r\n\\]*$/` ve `URL.origin` eşitliği. `app/auth/confirm` içindeki `resolveNextPath` zaten doğru. |

### Orta
| ID | Bulgu | Dosya | Durum | Öneri |
|---|---|---|---|---|
| A6 | Cron kimlik kontrolü `auth !== \`Bearer ${process.env.CRON_SECRET}\``; değişken tanımsızsa `Bearer undefined` kabul edilir. 12 rota: veli e-postası, paralı AI, bildirim, push yayını. `CRON_SECRET`'ın tüm ortamlarda (Preview dahil) tanımlı olduğu doğrulanamadı (Vercel env listeleme izni yok). | `app/api/cron/*/route.ts`, `app/api/push/route.ts` (GET) | Doğrulandı (kalıp) | Tek ortak yardımcı: `if (!secret || !timingSafeEqual(...)) 401`. |
| A7 | Canlı sınav: PUT'ta sınıf üyeliği, `status='active'` ve `question_index === current_question` kontrolü yok; yanıtta `correct_ans` hemen dönüyor, yeniden gönderilebiliyor; GET herkese katılma işareti yazıyor; PATCH `approved` bakmıyor. | `app/api/live-quiz/route.ts:139,167-245` | Raporlandı | Üyelik + durum + indeks doğrulaması, soru başına tek cevap, doğru cevabı açılıştan sonra ver. |
| A8 | `teacher/learning-risk/actions` POST: `classroom_id` yoksa sahiplik/üyelik kontrolü atlanıyor; `notify` ile herhangi bir kullanıcıya öğretmen-kontrollü bildirim yazılabiliyor. | `app/api/teacher/learning-risk/actions/route.ts:212-227` | Raporlandı | `classroom_id`'yi zorunlu yap, sahiplik+üyelik doğrula. |
| A9 | Web-push aboneliği: tüm kullanıcılar `endpoint` URL'sini serbestçe saklıyor, sunucu `webpush.sendNotification` ile oraya POST ediyor (kör SSRF); cron yayını hepsine gönderiyor. | `app/api/push/route.ts:30-120` | Raporlandı | Abonelikte `https` ve push servisi ana bilgisayar izin listesi (FCM, Mozilla, Apple, WNS), özel IP reddi. |
| A10 | `/api/extract-file`: bellekte `Map` ile parça biriktirme (parça/toplam boyut sınırı ve TTL yok), `ext` istemciden, hız sınırı yok, `e.message` istemciye dönüyor. Paralı Gemini/Anthropic çağrısı. | `app/api/extract-file/route.ts` | Raporlandı | Parça/toplam sınır (≤25 MB), TTL, uzantı izin listesi + sihirli bayt, `checkRateLimit`. |
| A11 | Paralı AI veya e-posta uçlarının çoğunda hız sınırı görünmüyor: yalnızca **5/211 rota** `checkRateLimit` kullanıyor. Örnekler: `ai-grade-analysis` (sınırsız `gradeNotes`), `ai-analysis`, `ai-literacy`, `adaptive-answer`, `verify-questions`, `grade-open-ended`, `pdf-tools`, `parent/send-summary` (her çağrıda e-posta). | çoklu | Raporlandı (kısmen) | Rota başına `checkRateLimit` + girdi boyutu sınırı; maliyet için günlük bütçe uyarısı. |
| A12 | `coaching-leads` herkese açık POST: hız sınırı, uzunluk sınırı, e-posta biçimi kontrolü yok; servis rolüyle tabloya yazıyor. | `app/api/coaching-leads/route.ts:26-50` | Raporlandı | IP sınırı, alan uzunlukları, honeypot/captcha. |
| A13 | `identity/resolve`: giriş yapmış herkes sınırsız UUID listesiyle ad+rol çözebiliyor; `classrooms/membership?includeRoster=1` sınıf arkadaşlarının UUID ve `plan` bilgisini veriyor (zincirleme). | `app/api/identity/resolve/route.ts:39-49`, `classrooms/membership/route.ts:128-185` | Raporlandı | Dizi sınırı (~50) + ilişki kısıtı; roster'dan `plan` ve gereksiz kimlikleri çıkar. |
| A14 | Güvenlik başlıkları yok: `next.config.ts`/`proxy.ts`'te `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` tanımlı değil (tıklama kaçırma, MIME sniffing). | `next.config.ts` | Doğrulandı | `headers()` ile ekle; CSP'yi önce `Report-Only` ile dene (KaTeX, Google OAuth, PayTR iframe, Supabase). |

### Düşük / Bilgi
- **A15** Öğrenci şifresi `Math.random()` ile üretiliyor (`institution/create-student/route.ts:23-30`); canlı sınav `join_code` da. → `crypto.randomInt`.
- **A16** ~65 rota `error.message`/`e.message` istemciye döndürüyor (ör. `extract-file`, `coaching-leads`). → Sunucuda logla, istemciye genel mesaj.
- **A17** İstemciden gelen `role` metni TR-PG `identities`'e doğrulanmadan yazılıyor (`auth/create-identity`, `profile/update-identity`). Şu an yetkilendirmede kullanılmıyor. → izin listesi (student/parent/teacher/institution_admin).
- **A18** `updateIdentity` sütun adlarını `Object.keys(updates)`'ten SQL'e koyuyor (`lib/identity/client.ts`). Bugün çağıranlar sabit anahtar kullandığı için sömürü yok; gelecekte gövde yayılırsa SQL enjeksiyonu olur. → Fonksiyon içinde izin listesi.
- **A19** Dahili `fetch`'ler kullanıcının Bearer'ını `req.nextUrl.origin`'e gönderiyor (`generate-quiz`, `teacher/create-open-ended`); Vercel'de sorun yok, kendi barındırmada `Host` sahteciliği riski. → Sabit `NEXT_PUBLIC_APP_URL` veya doğrudan fonksiyon çağrısı.
- **A20** `resolve-seller-code` (satıcı UUID + ad) ve `referral/referrer-name` oturumsuz ve sınırsız → deneme-yanılma ile kod avı. → IP sınırı, dönüşü azalt.
- **A21** `integrations/v1/students` `is_active` filtresi dışa aktarmada tutarsız; `identifiedStudents` öğrencinin tüm kurumlardaki sınıflarını listeliyor. → filtreyi tutarlı yap, kuruma kısıtla.
- **A22** PayTR geri çağrısında imzalı `total_amount` kayıtlı `price_paid` ile karşılaştırılmıyor (imza zaten tutarı kapsıyor; derinlemesine savunma).
- **A23** Hesap/log: `admin/exam-upload` `user.email` logluyor, `save-quiz` `userId` logluyor (KVKK açısından küçük).
- **A24** Yükleme yolu uzantısı istemciden (`file.name.split('.').pop()`): avatar/öğretmen belgesi. Yollar RLS ile kullanıcı klasörüne bağlı; ancak `avatars` herkese açık ve MIME sınırı yok (D8). `admin/*upload` rotalarında `ext`/`year` temizlenmiyor (yalnız yönetici).
- **A25** `reading/upload`: yol `startsWith(\`${user.id}/\`)` ile doğrulanıyor; `..` içeren yol reddi eklenmeli.
- **A26** Not: `grade-open-ended`'de öğrenci metni notlama istemine giriyor ("100 ver" enjeksiyonu → öz-puan). Notun sonraki yetkili akışlarda (XP, rozet, sıralama) güvenilip güvenilmediği doğrulanmadı.

### Bağımlılıklar
- `npm audit --omit=dev`: **1 yüksek** — `source-map-js` (olay döngüsü DoS, sadece derleme zamanı); `npm audit fix` ile kapanır. Üretim çalışma zamanında doğrudan etkisi görülmedi.
- Bu oturumda eklenen `country-state-city@3.2.1`: 17,5 MB; yalnızca sunucuda kullanılıyor, istemci paketine girmiyor.
- Gizli anahtar taraması: depoda `sk-`, `eyJ…`, özel anahtar, `.env` izlenmiyor (yalnızca `playwright.config.ts`'te sahte test anahtarları).

---

## 4. Eksiklikler ve geliştirmeler (güvenlik dışı)

**Altyapı / süreç**
1. **`migrate-production` GitHub işi `main`'de her birleştirmede başarısız** (son 5 koşu). Yerel migrasyon dosya adları (`20261009090000_…`) ile uzak sürüm kayıtları (`20261009073415`) uyuşmuyor; şema değişiklikleri fiilen MCP/panelden uygulanıyor. → Geçmişi `supabase migration repair` ile hizala veya işi kaldırıp tek yöntem belirle. (Bu oturumdaki konum migrasyonu da böyle uygulandı.)
2. **CI'da `eslint` çalışmıyor** (yalnız `tsc`, birim ve e2e). Depoda çok sayıda `no-explicit-any` ve `react-hooks/set-state-in-effect` hatası var. → Önce yeni kod için `--max-warnings` kapısı, sonra kademeli temizlik.
3. **Hız sınırı politikası dağınık**: 5/211 rota atomik `checkRateLimit` kullanıyor; `bot`/`chat` kendi (kırılgan) yöntemini yazmış. → Tek ara katman + rota başına tanım tablosu.
4. **Ortak yardımcılar**: güvenli `next` yolu, cron kimliği, kurum/sınıf sahipliği doğrulaması (`assertTeacherOwnsClassroom`) tekrar tekrar elle yazılmış; açıklar da bu kopyalarda çıkıyor.
5. **Sunucu hata ayıklaması**: `e.message` dönüşü ve PII günlükleri için ortak hata sarmalayıcı.
6. **`CRON_SECRET`, `TR_IDENTITY_DB_CA`/`VERIFY`** ortam değişkenlerinin Preview/Production'da varlığı doğrulanmalı (bu ortamda Vercel env okuma izni yok).

**Veri ve kimlik**
7. Kimlik veritabanı TLS doğrulaması hâlâ opsiyonel (CA/VERIFY yoksa doğrulamasız). Üretimde `TR_IDENTITY_DB_CA` tanımlanmalı.
8. Posta kodu/açık adres için VPS'te `docs/TR-PG-konum-alanlari.sql` çalıştırılmalı (yoksa kaydedilmiyor).
9. 816 kazanımsız onaylı soru hâlâ Kazanım Eşleştirme incelemesi bekliyor (bkz. `YOL-HARITASI-DOGRULAMA-VE-PLAN-18-EKIM-2026.md`).
10. Mistral Small fiyatı doğrulanmadı (`unverified`); eski sıfır maliyetli kayıtlar için geriye dönük doldurma yok.
11. KVKK: PII günlükleri, `identity/resolve` ve roster sızıntıları (A13, A23) için veri envanteri ve saklama süreleri belgelenmeli.

**Ürün / kalite**
12. Konum zorunluluğu şu an yalnızca öğrenciler için; öğretmen/kurum kayıtlarına eklenip eklenmeyeceği karara bağlanmalı.
13. Yönetici paneli korumasının istemci tarafında (`app/admin/page.tsx`) yapıldığı yorumu var; sunucu rotaları kendi kontrolünü yapıyor (doğru), ancak sayfa kabuğu da sunucu tarafında (`proxy.ts`) korunabilir.
14. Test kapsamı: yetkilendirme açıkları için birim/e2e **negatif testler** (başka kurum/sınıf kimliğiyle istek → 403) yok; `e2e/tenant-isolation.spec.ts` genişletilmeli (A2, A3, A8 senaryoları).
15. Güvenlik olay izleme: cron/bot/AI çağrıları için anormal kullanım uyarıları (günlük maliyet eşiği) yok.

---

## 5. Önerilen kapatma sırası

**Gün 1 (SQL + küçük kod, düşük risk)**
1. D1: `api_rate_limits` politikasını sil, `anon` yetkisini kaldır → `bot`/`chat`'i `checkRateLimit`'e geçir (A4).
2. D2/D3: `live_quiz_answers`, `class_members`, `classes`, `challenge_attempts` herkese açık politikalarını kaldır.
3. A1: `institution/join` token zorunluluğu.
4. A6: ortak cron yardımcısı (12 rota).
5. A5: ortak `safeNextPath` (callback + 4 sayfa).

**Hafta 1**
6. A2, A3, A8: sınıf sahipliği doğrulaması (ortak yardımcı) + negatif e2e testleri.
7. A4: `bot` istem/uzunluk/IP sınırları; A10, A11, A12 sınırları ve boyut kapıları.
8. A7 canlı sınav kuralları; A9 push SSRF izin listesi.
9. D4: `anon`'dan toplu `REVOKE` + gerekli tablolara tek tek `GRANT`; `ALTER DEFAULT PRIVILEGES`.
10. D5/D6: `institutions` sütun kısıtı, kuruma katılım yalnız sunucudan, `seller_id` yetkisi.

**Hafta 2–3**
11. A14 güvenlik başlıkları (CSP önce Report-Only). 12. D8 kova MIME/boyut sınırları. 13. A13 kimlik çözümleme kısıtı. 14. Düşük maddeler (A15–A26). 15. Altyapı maddeleri (Bölüm 4: migrasyon geçmişi, eslint kapısı, ortak yardımcılar).


