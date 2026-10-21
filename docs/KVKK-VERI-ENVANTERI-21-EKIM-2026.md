# Pratium — KVKK Veri Envanteri ve Saklama Planı (21 Ekim 2026)

> **Kapsam ve sınır:** Bu belge teknik bir envanterdir; hukuki görüş değildir. "Doğrulandı" ibaresi, canlı veritabanında / kodda 21 Ekim 2026'da bakıldığı anlamına gelir. Hukuki dayanak ve saklama süreleri **öneridir**; yayına almadan önce KVKK danışmanınızla / hukukçunuzla doğrulayın. Kimlik bilgileri bu belgede yer almaz, yalnızca veri türleri ve satır sayıları vardır.

## 1. Önce bakılması gerekenler (öncelik sırasıyla)

| # | Bulgu | Neden önemli | Öneri |
|---|---|---|---|
| 1 | Yayındaki `/kvkk/aydinlatma` sayfasında doldurulmamış yer tutucular var: `[TARİH]`, `[ŞİRKET UNVANI]`, `[ADRES]`, `[NO]` (MERSİS), `[30]` | Eksik veri sorumlusu bilgisiyle aydınlatma yükümlülüğü yerine getirilmiş sayılmaz | Gerçek unvan, adres, MERSİS ve tarih ile doldurun (kod değil içerik işi) |
| 2 | İki ayrı aydınlatma metni var ve birbirleriyle çelişiyor (`/privacy` ve `/kvkk/aydinlatma`) | Saklama süresi `/privacy`'de "en fazla 3 yıl", `/kvkk/aydinlatma`'da "zamanaşımı süreleri; hesap silinince [30] gün". Alıcı listesi de farklı | Tek bir metne indirin, diğerini ona yönlendirin |
| 3 | Metinlerde "silme 30 gün içinde" sözü var, ama **otomatik imha yok** | Silme talebi `data_lifecycle_requests` kaydı açar; silmeyi bir operatör elle yapar. Kullanıcı verisi silen zamanlanmış bir iş yok (`vercel.json` cron rotaları incelendi: `reconcile-identities` yalnızca kimlik uyumsuzluklarını düzeltir, silme yapmaz) | Operatör süreci yazılı olsun (Bölüm 6), tercihen ileride otomasyon |
| 4 | Aydınlatmada "yapay zekâya kimlik bilgisi gitmez, yalnızca anonimleştirilmiş içerik iletilir" deniyor | Öğrencinin yazdığı serbest metin (açık uçlu cevap, koç/asistan sohbeti) kimlik bilgisi içerebilir; içerik temizlenmiyor | İfadeyi "ad, e-posta ve kullanıcı kimliği gönderilmez; kullanıcının yazdığı metin iletilir" şeklinde düzeltin |
| 5 | Aydınlatmadaki veri listesi eksik | Listede yok: konum (ülke/il/ilçe), posta kodu/açık adres, telefon, cinsiyet, profil fotoğrafı, öğretmen belgeleri, koç/asistan sohbetleri, açık uçlu cevaplar, bildirim abonelikleri | Listeyi bu belgenin Bölüm 3'üne göre güncelleyin |
| 6 | Aktarım listesi eksik (`/privacy`: Supabase, Anthropic, ödeme) | Fiilen ayrıca OpenAI, Mistral, Google (Gemini), Vercel, Resend ve Türkiye'deki VPS kullanılıyor | Bölüm 4'teki alıcılar eklensin |
| 7 | `avatars` kovası herkese açık | Çocukların profil fotoğrafları URL'yi bilen herkese açık | İmzalı (süreli) URL'ye geçmeyi değerlendirin, yazılım işi |
| 8 | `profiles_backup_before_hybrid` yedek tablosu duruyor (48 satır: yaş, cinsiyet, okul; 1 satırda telefon) | Veri minimizasyonu: kimlik verisi TR-PG'de tutulacak tasarımıyla çelişen eski kopya | **21 Ekim'de `authenticated`/`anon` tablo yetkileri kaldırıldı** (zaten RLS ile tamamen kapalıydı). Silinmesine karar verin (öneri: silin) |
| 9 | `teachers` tablosunda eski kimlik sütunları dolu: `email` 3, `phone` 1 satır | Kimlik verisi Supabase'de kalmış | TR-PG'ye taşıyıp sütunları boşaltın (öneri) |
| 10 | 18 yaş altı veli onayı yalnızca **beyan** (onay kutusu) | Veli onayı doğrulanmıyor | Risk değerlendirmesi, istenirse e-posta ile veli onayı |

## 2. Veri depoları ve konum

| Depo | İçerik | Konum / işleyen | Not |
|---|---|---|---|
| **TR-PG (VPS)**, `identities` tablosu | Ad-soyad, e-posta, yaş, rol, veli e-postası ve doğrulama durumu, kurum adı, telefon, posta kodu, açık adres | Kendi VPS'iniz (`identity` veritabanı) | Kimlik verisinin asıl yeri. Sunucu sertifikası 21 Ekim'de doğrulamalı bağlantıya geçti. VPS'in bulunduğu ülkeyi ve sağlayıcıyı bu belgede doğrulamadım |
| **Supabase** (proje QuizAI) | Kimlik doğrulama hesapları (`auth.users`: e-posta, sağlayıcı), profil, test ve öğrenme verileri, bildirimler, kurum/sınıf ilişkileri, dosyalar | Bölge `eu-west-1` (İrlanda) | Doğrulandı. Türkiye dışı, AB içi |
| **Supabase Storage** | `avatars` (herkese açık), `teacher-documents`, `reading-uploads`, `meb-resources`, `publication-evidence` (özel) | Aynı | Doğrulandı |
| **Vercel** | Uygulama ve sunucu günlükleri (hata, uyarı, `[csp-report]` satırları) | Fonksiyon bölgesi `dub1` (Dublin), günlüklerde `fra1` de görüldü | Günlük saklama süresi plana bağlı |
| **Mistral konsolu / Anthropic / OpenAI / Google** | Yapay zekâya gönderilen istemler | Bkz. Bölüm 4 | `ai_usage_logs` bunların yalnızca token ve maliyet kaydıdır |
| **Natro / İHS** | Kurumsal site (`pratium.com.tr`) ve alan adı | Türkiye | Platform verisi tutmaz |

## 3. Veri kategorileri

(Satır sayıları 21 Ekim 2026 itibarıyla yaklaşık değerlerdir.)

| Kategori | Veri | Depo / tablo | Dayanak (öneri) | Saklama bugün | Saklama önerisi |
|---|---|---|---|---|---|
| Hesap ve kimlik | Ad-soyad, e-posta, yaş, rol, telefon | TR-PG `identities`; e-posta ayrıca `auth.users` | Sözleşme (m.5/2-c) | Üyelik süresince, otomatik imha yok | Üyelik süresince; silme talebinden sonra 30 gün içinde |
| Konum | Ülke, eyalet/il, şehir/ilçe (`profiles`, 109 profil), posta kodu ve açık adres (opsiyonel, TR-PG) | `profiles`, TR-PG | Sözleşme / meşru menfaat (müfredat seçimi) | Üyelik süresince | Üyelik süresince |
| Profil | Sınıf, okul, sınıf numarası, cinsiyet, dil, fotoğraf (`avatars`) | `profiles`, Storage | Sözleşme; fotoğraf için açık rıza (öneri) | Üyelik süresince | Fotoğraf: kaldırıldığında silinir |
| Eğitim performansı | Test oturumları, cevaplar, öğrenme olayları, mastery, hata kalıpları | `quiz_sessions`, öğrenme tabloları | Sözleşme; AI analiz için açık rıza | Üyelik süresince | Üyelik süresince; 2 yıl hareketsiz hesap anonimleştirme |
| Serbest metin | Açık uçlu cevaplar (123 oturum), koç sohbetleri (24), hata bildirimleri (222) | `open_ended_sessions`, `coach_conversations`, `error_reports` | Açık rıza (AI analizi) / meşru menfaat (hata) | Üyelik süresince | Hata bildirimleri 12 ay; sohbetler 12 ay |
| Veli / kurum / sınıf | Veli bağlantısı, kurum üyeliği, sınıf kayıtları | `parent_children`, `institution_users`, `classroom_students` | Sözleşme, veli rızası | Üyelik süresince | Üyelik süresince |
| Öğretmen | Okul, branş, başvuru belgeleri (diploma vb.), eski e-posta/telefon | `teachers`, `teacher-documents` | Sözleşme; belgeler için açık rıza | Süresiz | Başvuru reddedilirse 30 gün; onaylanırsa görev süresince |
| Kurum | Kurum adı, yönetici e-postası, konum | `institutions` (7 kayıt) | Sözleşme | Süresiz | Sözleşme süresince |
| Ödeme / abonelik | Plan, abonelik kimlikleri; kart verisi PayTR'de | `subscriptions`, `referrals` | Hukuki yükümlülük (m.5/2-ç) | Süresiz | Vergi/ticaret mevzuatındaki süreler; danışmanınızla netleştirin |
| Bildirim | Web push uç noktası ve anahtarları | `push_subscriptions` | Açık rıza (tarayıcı izni) | Abonelik süresince | İptalde silinir (koda eklenmiş) |
| İletişim / satış | Koçluk talebi formu (1 kayıt: e-posta, telefon), satıcı bilgileri (7 satır: ad, e-posta, telefon, adres) | `coaching_leads`, `sellers` | Açık rıza / sözleşme | Süresiz | Talep formu 12 ay |
| Güvenlik ve kullanım | AI çağrı kaydı (kullanıcı kimliği, model, token, maliyet; içerik sütunu yok), hız sınırı, denetim kayıtları, IP (Vercel/Supabase günlükleri) | `ai_usage_logs`, `api_rate_limits`, denetim tabloları | Meşru menfaat (m.5/2-f) | Süresiz | AI kaydı 12 ay sonra kullanıcı kimliği kaldırılır |

`ai_usage_logs.meta` alanının içeriğini doğrulamadım; kişisel veri taşımadığından emin olunmalı.

## 4. Alıcılar ve yurt dışı aktarım (KVKK m.9)

| Alıcı | Amaç | Gönderilen veri | Konum |
|---|---|---|---|
| Supabase | Veritabanı, kimlik doğrulama, dosya | Bölüm 3'teki Supabase verileri | İrlanda (AB) |
| Vercel | Barındırma, günlükler | İstek günlükleri, uygulama çıktısı | Dublin / Frankfurt (AB) |
| Anthropic | Soru üretimi, notlama, koç ve asistan | Soru ve cevap metni, kullanıcının yazdığı metin | ABD (doğrulayın) |
| OpenAI | Soru üretimi (pilot) | Aynı | ABD (doğrulayın) |
| Mistral AI | Soru üretimi ve doğrulama | Aynı | Fransa (AB) |
| Google (Gemini) | Görsel ve metin doğrulama | Aynı | ABD (doğrulayın) |
| Resend | Veli özeti ve uyarı e-postaları | Veli e-postası, öğrenci özeti | Doğrulayın |
| PayTR | Ödeme | Ödeme bilgileri PayTR'de kalır | Türkiye |
| TR-PG VPS | Kimlik verisi | Bölüm 2 | Doğrulayın |

AI sağlayıcılarına **ad, e-posta ve kullanıcı kimliği gönderilmediği** koddan doğrulanabilir bir niyet olarak belgelenmiştir, ancak kullanıcının yazdığı serbest metin içeriği temizlenmez (bkz. Bölüm 1, madde 4). Sağlayıcılarla veri işleme sözleşmeleri ve KVKK m.9 güvencesi (standart sözleşme/taahhüt) için dosyalarınızı kontrol edin.

## 5. Mevcut imha ve saklama mekanizmaları

- **Silme talebi:** `Profil → Kaydımı sil` (`/api/profile/data-request`) `data_lifecycle_requests` kaydı açar (1 kayıt var). Yönetici panelindeki "Veri talepleri" ekranından işlenir.
- **Otomatik imha yok.** Hesap silme, süre sonu silme ve anonimleştirme zamanlanmış iş olarak tanımlı değil.
- **Çocuk verisi:** Veli panelinden erişim ve silme talebi mümkün; yetki doğrulaması operatör sürecindedir (`docs/DATA_LIFECYCLE_KVKK_V1.md`).
- **Düzeltmeler bu sürümde:** `push_subscriptions` yalnızca izin listesindeki push servislerine kaydedilir; `profiles_backup_before_hybrid` tablosunun tablo yetkileri kaldırıldı.

## 6. İlgili kişi taleplerinde önerilen operatör süreci

1. Talep (e-posta veya uygulama) gelince kimlik doğrulaması: hesabın e-postasından geliyorsa doğrulanmış sayılır; velinin talebinde veli bağlantısı kontrol edilir.
2. `data_lifecycle_requests` kaydı açılır/ilişkilendirilir (denetim izi).
3. Kapsam belirlenir: TR-PG `identities`, Supabase `auth.users` + `profiles` + öğrenme tabloları, Storage dosyaları, AI sağlayıcılarında tutulan kayıtlar (sağlayıcı saklamasına tabi).
4. Silme sırası: önce bağımlı veriler, sonra `profiles`, `auth.users`, en son `identities`; her adım kayda geçirilir.
5. Yanıt en geç 30 gün içinde, silinen/silinemeyen veriler gerekçesiyle bildirilir.

## 7. Önerilen yapılacaklar

**Sizde (içerik/hukuk):**
1. Aydınlatma metinlerini birleştirip yer tutucuları doldurun (Bölüm 1, madde 1–2, 4–6).
2. Saklama sürelerini (Bölüm 3, son sütun) hukukçunuzla onaylayın; VERBİS ve veri işleme sözleşmeleri için durumunuzu kontrol edin.
3. `profiles_backup_before_hybrid` silinsin mi karar verin.

**Bende (kod), onayınızla:**
1. `teachers.email/phone` eski verisini TR-PG'ye taşıma ve sütunları boşaltma.
2. Zamanlanmış temizlik işi: 12 aylık `ai_usage_logs` kullanıcı kimliği kaldırma, `error_reports`/`coaching_leads`/`coach_conversations` süre sonu silme.
3. Hesap silme operatör akışını yönetici panelinde adım adım hale getirme.
4. `avatars` için imzalı URL.
