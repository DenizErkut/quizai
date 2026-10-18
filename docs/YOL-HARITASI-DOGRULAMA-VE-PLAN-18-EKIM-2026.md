# Pratium — Yol Haritası Doğrulaması ve Birleşik Plan

**Tarih:** 18 Ekim 2026
**İncelenen dosyalar:** `PRATIUM-YOL-HARITASI-18-EKIM-2026.md` (yol haritası) ve `AI-EdTech-Startup-Bultenleri-13-18-Ekim-2026.md` (bülten arşivi)
**Yöntem:** Yol haritasındaki sayısal iddialar canlı Supabase veritabanında (proje `cnkpexqyhjfgrhnkxitj`) salt okunur SQL ile, kod iddiaları depodaki güncel `main` ile karşılaştırıldı. Hiçbir veri değiştirilmedi, ücretli AI çağrısı yapılmadı.
**Sınır:** Girişli ekranlar, VPS kimlik DB'si, ödeme ve dış kaynaklar (haber/fon sayfaları) bu çalışmada bağımsız doğrulanmadı; bunlar dosyanın kendi "doğrulandı / doğrulanmadı" işaretlerine göre okunmalıdır.

---

## 1. Sonuç

Yol haritasının **sayısal ve teknik iddiaları canlı sistemle birebir örtüşüyor**; stratejik sonucu (yeni özellik değil, kanıt + güvenilirlik + maliyet doğruluğu) doğru buluyorum. Üç yerde eksik veya düzeltilmesi gereken nokta var (Bölüm 3) ve yol haritasının hiç görmediği, bu çalışmada bulunan dört açık var (Bölüm 4).

## 2. Sayısal doğrulama (canlı DB, 18 Ekim)

| İddia | Yol haritası | Canlı DB | Sonuç |
|---|---:|---:|---|
| Kazanım kataloğu | 3.833 | 3.833 (hepsi `verified`) | ✅ |
| Aktif kazanım | 3.816 | 3.816 | ✅ |
| Konu listesi boş aktif ders | 0 | 0 | ✅ |
| Onaylı / aday / red soru | 2.573 / 2.025 / 651 | 2.573 / 2.025 / 651 (toplam 5.249) | ✅ |
| Onaylı soruda geçerli katalog ID yok | 816 | 816 | ✅ |
| Öğrenme olayı / kazanım bağlı | 3.685 / 1.177 | 3.685 / 1.177 (%31,9) | ✅ |
| Tamamlanmış döngü | 3, tek öğrenci | 3, 1 öğrenci | ✅ |
| Doğrulanmış ön koşul ilişkisi | 21 | 21 (`prerequisite_of`, doğrulanmış) | ✅ |
| Yanılgı kümesi | 12 onaylı, 3 red, 1 öneri | 12 / 3 / 1 | ✅ |
| Mikro içerik | 17 onaylı + 5 taslak | 17 / 5 | ✅ |
| Education Eval | 600 çıktı, 300 puanlı | 600 / 300 | ✅ |
| Public tablo / RLS | 137 / 137 | 137 / 137 | ✅ |
| Son 7 gün AI maliyeti | 503 çağrı, 2,38 USD | 497 çağrı, 2,36 USD (hareketli pencere, bir saat sonra) | ✅ (aynı büyüklük) |
| Bilinmeyen fiyat / doğrulanmamış fiyat | 22 / 65 çağrı | 22 / 65 | ✅ |
| TLS: ayar yoksa doğrulamasız bağlantı | evet | `lib/identity/ssl.ts`: CA/VERIFY yoksa `rejectUnauthorized:false` + uyarı | ✅ |
| Mistral Small fiyatı "unverified" | evet | `mistral-small-unverified-2026-10` | ✅ |

Yol haritasının kendi dürüstlük notları da yerinde: "maliyet hiç tutulmuyor" ve "maliyet faturayla doğrulandı" ifadelerinin ikisi de yanlış; gerçek durum kısmen düzelmiş.

## 3. Düzeltilmesi / netleştirilmesi gerekenler

1. **"816 yanlış soru anlamına gelmez" — doğru; ama düzeltme (19 Ekim):** 816'nın 613'ünde soru JSON'unda katalogda tek kayda çözülen bir `learningObjectiveCode` var, 203'ünde hiç yok. İlk değerlendirmemde bu 613'ü "deterministik doldurulabilir" diye yazmıştım; bu **yanlıştı**. Sistem model çıktısındaki kod/ID'yi bilerek güvenilir saymıyor (`applyCanonicalObjectiveMappings`); bu kodlar model iddiası, kaynağı doğrulanmamış. Doğru yol: kodu yalnızca **öneri** olarak kullanıp mevcut Kazanım Eşleştirme incelemesinden (insan onayı veya iki bağımsız AI denetçisi) geçirmek. Doğrudan SQL ile ID yazılmadı.
2. **Dağılım bilgisi eksik:** 816'nın yaklaşık 287'si 16 Ekim'de tek günde üretilen Lise 9 Fizik/Kimya/Biyoloji (98/97/92) ve ~216'sı Ortaokul 7 Fen/Matematik. Yani artış **toplu üretim/yükleme kaynaklı** (yol haritası "kaynağı incelenmeli" diyor; kaynak büyük ölçüde bu iki toplu iş). Kazanımsız toplu üretimin tekrarlanmaması için üretim hattına "kod yoksa onaylama" kapısı gerekir (Bölüm 5, Faz 0).
3. **Pilot kazanım seçimi 6. sınıf Matematik+Fen önerisi mantıklı, ama** bu iki dersin onaylı soruları arasında 6. sınıf Matematik'te 60, Fen'de 16 soruda hâlâ ID yok; pilota girmeden önce bunlar kapatılmalı.
4. **Tools Competition:** dosya doğru söylüyor (ilk aşama 13 Ekim'de kapandı). Başvuru yapılıp yapılmadığını ben bilmiyorum; yapıldıysa 24 Kasım davet tarihi takip edilmeli.

## 4. Yol haritasının görmediği açıklar (bu çalışmada bulunanlar)

1. **Türkçe soru kalitesi (öğretmen geri bildirimi, 18 Ekim):** Türkçe'de anlam kazanımlarında metin verilmeden "konunun önemi" soruluyor; yazım/noktalama kazanımlarında uygulama yerine bilgi sorusu üretiliyor; Türkçe soruları açık uçlu (AUS) olarak da yapılıyor. **Kural düzeltmesi bugün canlıya alındı** (PR #73, #74: çoktan seçmeli ve açık uçlu üretim). Ama yol haritasında **öğretmen etiketli kalite ölçümü Türkçe için yok**; Matematik/Fen dışındaki dersler pilot kapsamının dışında kalıyor. Öneri: Türkçe için en az 30 soruluk öğretmen incelemesi (anlam/yazım/dil bilgisi dağılımıyla) ve kural değişikliğinin öncesi/sonrası karşılaştırması.
2. **Çıkarılan öğrencinin bekleyen ödevleri:** Bugün öğretmenin öğrenciyi sınıftan çıkarma özelliği canlıya alındı (PR #75). Öğrenci çıkarıldıktan sonra ona atanmış açık ödevlerin/atamaların akıbeti tanımlı değil; pilot verisi (öğrenci başına döngü sayımı) bu duruma duyarlı olmalı.
3. **Kapsam eksikleri:** 9 seçmeli lise dersi bilerek yüklenmedi (sınıf ataması kararı bekliyor); 6/7. sınıf Türkçe için 14 katalog kodu ve İngilizce `ENG.5.7.*` kodları 2026 PDF'lerinde yok (kaynak doğrulaması gerekir); DKAB MEB TYMM'de doğrulanamadı. Yol haritası "yeniden yükleme yerine kapsam/alt beceri doğrulaması" diyor — bu üç madde tam o doğrulamanın girdisi.
4. **Tarihsel maliyet boşluğu:** Mistral Small'da fiyat doğrulanana kadar maliyet "unverified" etiketli; eski ~410 kayıt sıfır maliyetli kalmıştı (bugünkü sorguda son 7 gün için 22 bilinmeyen + 39 sıfır maliyetli çağrı görünüyor). Resmî fiyat teyidi + geriye dönük doldurma (eski kayıtlar silinmeden, ayrı sürüm etiketiyle) planlanmalı.

## 5. Birleşik yol haritası (19 Ekim – 29 Kasım)

Yol haritasındaki faz yapısını koruyorum; yukarıdaki bulguları ilgili fazlara ekledim. Süreler tahmindir.

### Faz 0 — Doğru temel (19–25 Ekim)
- **816 soru:** kazanım kanıtı üretmiyorlar (tüm kanıt yolları `hasVerifiedObjectiveMapping` ister); yalnızca genel stok olarak sunulabilirler. 613'ü model iddiası kodla, 203'ü kodsuz; hepsi Kazanım Eşleştirme incelemesine girmeli (ders/sınıf filtresi 17 Ekim'de eklendi).
- Üretim hattına kapı: **yapıldı (19 Ekim)** — yönetici/editör `question-bank-review` onayı, kazanımı doğrulanmamış soruyu (imzalı `teacher_exact`/`ai_exact` hariç) reddeder. Sürekli inceleme hattında bu kapı zaten vardı; açık kapı elle onay yoluydu.
- Maliyet: Mistral Small resmî fiyatını teyit et → `unverified` etiketini kaldır → eski sıfır maliyetli kayıtları ayrı bir `backfill` sürümüyle doldur (silme yok).
- TLS: Vercel'de `TR_IDENTITY_DB_CA` veya `TR_IDENTITY_DB_SSL_VERIFY=true` ayarla; bağlantıyı kontrollü test et (ayar yoksa doğrulamasız çalışıyor).
- İki kurum / öğretmen / veli / öğrenci test hesabıyla erişim sınırı testi (izinli + engelli senaryolar).
- Pilot izin/veri kapsamı: yaş, veli yetkisi, AI kapsamı, çekilme akışı (hukuk danışmanı onayı gerekli; bu rapor onay vermez).
- **Ek:** Kapsam doğrulaması (Bölüm 4.3) — 14 Türkçe kodu, ENG.5.7, DKAB; seçmeli lise sınıf ataması kararı.

### Faz 1 — Yanılgı doğruluğu (26 Ekim – 1 Kasım)
Yol haritasındaki plan aynen: 100 öğretmen etiketli çift (40 eşdeğer / 40 aynı konu farklı hata / 20 belirsiz) + 20 grup örneği, iki bağımsız etiketleyici, geliştirme/kilitli test ayrımı, yanlış birleştirme oranı ve güven aralığı. Mevcut güvenli işlem altyapısı (kilitleme, güncellik/alias kontrolü) üzerine **etiket/kazanım/sürüm hash'iyle bayat öneriyi reddetme + geri alma** sınanır. "~%2 üst sınır için ~150 bağımsız negatif örnek" notu doğru ölçüde konulmuş (sıfır hata, üst sınır kanıtlamaz).

### Faz 2 — Öğretmen kullanım kanıtı (2–8 Kasım)
Yol haritasındaki 30 dakikalık görev tabanlı onboarding + 3–5 öğretmenle kullanılabilirlik çalışması. **Ek:** Türkçe öğretmen incelemesi (Bölüm 4.1) bu fazda yapılır; Türkçe branş öğretmeni (geri bildirimi veren kişi) gönüllü olarak dahil edilir.

### Faz 3 — Bağımsız öğrenme mini pilotu (9–22 Kasım)
Yol haritasındaki tasarım: 20–30 öğrenci, 4–6 kazanım, ≥2 öğretmen, her öğrencide kendi döngü kimliğiyle ön test → çalışma → ≥24 saat sonra yardımsız aktarım. **Ek:** Sınıftan çıkarılan öğrenci ve bekleyen ödev akışı (Bölüm 4.2) döngü sayımına dahil edilmeden önce tanımlanmalı. Nedensel "öğrenmeyi artırdı" iddiası, karşılaştırma grubu olmadan kurulmaz.

### Faz 4 — Ekonomi, dayanıklılık, sonuç paketi (23–29 Kasım)
Yol haritasındaki gibi: döngü başına maliyet (istek/workflow kimliğiyle), katkı payı, shadow router (kalite/güvenlik/veri aktarımı/maliyet kapısı olmadan canlı fallback yok), 300 puansız eval çıktısı için ayrı çalışma, kısa pilot raporu.

### Paralel hat — Güvenlik ve veri yönetişimi
Yol haritasındaki hat geçerli: safety scorecard'a bağımsız test sonuçları, yaş/sızdırma/bağımlılık/PII/prompt injection senaryoları, veri akışı ve sağlayıcı envanteri (öğrenci → Supabase → model sağlayıcı → log → yedek). "Türkiye'de kimlik DB'si" tek başına KVKK uyumu sayılmaz.

## 6. Bültenler hakkında

Bülten dosyası kendi içinde "doğrulanmamış" uyarısı taşıyor ve yol haritası bunu doğru okuyor (yatırım tutarları, model üstünlükleri plan gerekçesi yapılmamış). Bültenin ürünle doğrudan ilgili somut dersleri zaten haritada: yanılgı birleştirmede öğretmen onayı, çocuklara yönelik koçta güvenlik/bağımlılık riski (Character.AI), birim ekonomi (Synthesia/Ramp), ekran süresi tartışmasında "öğrenme kazanımı/dakika"ya tek başına güvenmeme. Fon fırsatlarında Harness RFP'nin ABD merkezli başvuran ve açık kaynak çıktı şartı Pratium'un mevcut şirket yapısıyla doğrudan uyumsuz; yol haritasının "ürün planını bozma" notuna katılıyorum. Cities Deliver yetişkin/belediye odaklı; ürün planına etki etmemeli.

## 7. Şimdilik yapılmaması gerekenler (yol haritasına ek)

- Yol haritasındaki listeye ek: kazanımı/kodu olmayan toplu soru üretimi (bugünkü 816 açığın kaynağı), Türkçe'de kuralları test etmeden yeni konu açmak, çıkarılan öğrencilerin geçmiş döngülerini sessizce silmek.

## 8. İlk üç somut iş (öneri sırası)

1. 816 sorunun Kazanım Eşleştirme incelemesi (613'ünde model önerisi kod var). "Kodsuz soru onaylanamaz" kapısı yapıldı.
2. Mistral Small fiyat teyidi ve eski maliyet kayıtlarının geriye dönük doldurulması; TLS CA ayarı.
3. 100 çiftlik yanılgı etiket seti için iki branş öğretmeninin takvimi (Matematik + Fen; Türkçe incelemesi paralel).
