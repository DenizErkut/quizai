# Pratium — MEB Yeni Sistem Uyumluluk Raporu (21 Kasım 2026)

Kapsam: MEB'in güncel müfredat ve ölçme-değerlendirme düzeni (Türkiye Yüzyılı Maarif Modeli, Ortak Yazılı Sınav Sistemi, ülke geneli ortak yazılı sınavlar, LGS/YKS) ile Pratium platformunun (kod + canlı veri tabanı) karşılaştırması.

**Yöntem ve sınırlar (dürüst not).**
- MEB bilgileri, doğrudan **meb.gov.tr resmî sayfalarından ve resmî PDF'lerden** okundu (takvim, OYSS Uygulama Kılavuzu, 2026-2027 Genelgesi, Bakan Yardımcısı açıklaması, yönetmelik değişikliği). Resmî kaynak olmayan bilgiler (haber siteleri) **"basın"** diye işaretlendi.
- Platform tarafı, depodaki kod ve Supabase üretim veritabanının **salt okunur sorgularıyla** incelendi. Canlı siteye (pratium.com) bu ortamdan erişilemediği için ekranlar canlıda gezilmedi; ekran davranışı kod okumasından çıkarıldı.
- Hukuki yorum yapılmadı; "Risk" başlıklı maddeler **hukuk danışmanıyla** teyit edilmelidir.

---

## 1. Yönetici özeti

| Alan | Durum | Kısa sonuç |
|---|---|---|
| Müfredat / kazanım kataloğu | 🟢 İyi, 🟡 boşluklar var | 3.816 aktif MEB 2026-2027 kazanımı (1-12. sınıf), Maarif "öğrenme çıktısı" kodlarıyla (örn. FB.7.1.1). 5. sınıf Matematik'te yalnızca 6 MEB kazanımı var (6. sınıfta 24, 7. sınıfta 30). 2027-2028 sürümü taslak ve **boş**. |
| Soru bankası | 🟡 Kısmen | 2.827 onaylı soru, yalnızca 5-9. sınıfta yoğun. **10. sınıf 26, 11. sınıf 0, 12. sınıf 3 soru**; Türkçe/Din/İngilizce zayıf. (Yapay zekâ üretimi bu boşluğu canlıda kapatır ama onaylı banka kapatmaz.) |
| Maarif soru tipleri ve beceri temelli üretim | 🟢 Uyumlu | Çoklu D/Y, tablo doldurma (MM etiketli), yeni nesil/beceri temelli üretim kuralı, görsel kotaları (%30 / yeni nesil %50 / geometri %90). |
| "Yazılıya Hazırlanıyorum" (yazılı setleri) | 🟢 Model uyumlu, 🟡 kapsam dar | OYSS'ye en yakın özellik: 100 puanlık setler, **her soruda öğrenme çıktısı kodu (%100)**, rubrik. Ancak **12 set**: yalnızca 5-6-7-9. sınıf, **1. dönem 1. yazılı**; **hiç Matematik yok**, 10-11. sınıf yok. |
| Açık uçlu senaryo kartları (AUS) | 🟡 Kısmen | Senaryo + açık uçlu + rubrik biçimi uyumlu; içerik **yalnızca 7. sınıf 1. dönem, 4 ders**, **kazanım alanı yok**. |
| Sınav simülasyonu (LGS/TYT/AYT/YDT) | 🟢 Uyumlu, 🟡 tarih güncel değil | Soru sayıları, süreler, net hesabı resmî yapıyla uyumlu. Kodda `EXAM_YEAR = 2026`; 2027 tarihleri (LGS 13 Haziran, YKS 19-20 Haziran) işlenmemiş. |
| Öğretmen ödev / sınıf araçları | 🔴 Risk (politika) | 2026-2027 Genelgesi, ödevde Bakanlığın belirlediği dijital platformlar dışındaki araçlardan **kaçınılmasını** ve Bakanlık dışı sınav/deneme uygulamalarını okullarda yasaklamasını söylüyor. |
| Sınav gizliliği | 🟡 Dikkat | OYSS Kılavuzu soru görüntülerinin alınmasını/paylaşılmasını yasaklıyor; platformda kâğıt/PDF yükleme akışları var. |
| MEBİ / Yeni EBA (rakip/çevre) | ℹ️ Bilgi | MEB kendi yapay zekâ destekli platformunu (MEBİ, Yeni EBA) yaygınlaştırıyor; konumlandırma etkisi var. |

**En önemli üç sonuç:**
1. Teknik/pedagojik uyum güçlü; asıl risk **politika** tarafında (okullarda kullanım, ödev, deneme/sıralama).
2. OYSS ile model olarak zaten uyumluyuz (100 puan, kazanım kodlu açık uçlu setler); eksik olan **içerik kapsamı** (Matematik, 10-11. sınıf, 2. yazılı) ve resmî senaryo/dağılım tablosu eşlemesi.
3. Bazı veri boşlukları (10-11. sınıf bankası, 5. sınıf Matematik kazanımları, 2027-2028 sürümü) önümüzdeki aylarda kapatılmalı.

---

## 2. MEB'in güncel durumu (Kasım 2026)

### 2.1 Türkiye Yüzyılı Maarif Modeli — kademeli geçiş *(basın + resmî açıklamalarla tutarlı)*
- 2024-2025'te başlayan model, her yıl yeni sınıflara ekleniyor. 2026-2027'de kapsamdaki düzeyler: **ilkokul 1-2-3, ortaokul 5-6-7, ortaöğretim 9-10-11** (hazırlık dahil). Bakan Yardımcısı (Aralık 2025) 2025-2026'da ilkokul 2, ortaokul 6, lise 10'un da kapsamda olduğunu doğruladı.
- Aynı basamak mantığıyla **2027-2028'de 4, 8 ve 12. sınıflar** girecek. *(Tek kaynaklı basın bilgisi; resmî teyit yok.)*
- 12. sınıf 2026-2027'de eski program: bugünkü 10-12. sınıf öğrencileri YKS'ye eski müfredatla girer.

### 2.2 Ortak Yazılı Sınav Sistemi (OYSS) — **resmî**, 20 Ekim 2026
- Bakanlığa bağlı **resmî ve özel** ortaokul/liselerde, **5-6-7** (Türkçe, Matematik, Fen, Sosyal Bilgiler, Din Kültürü, İngilizce) ve **9-10-11** (Türk Dili ve Edebiyatı, Matematik, Fizik, Kimya, Biyoloji, Tarih, Coğrafya, Din Kültürü, Felsefe, İngilizce). **7. ve 11. sınıf İngilizce kapsam dışı.**
- Yazılılar **açık uçlu** (veya açık uçlu + kısa cevap); **40 dakika, 100 tam puan, en çok 4 sayfa**.
- Genel Müdürlük, derslere göre **"konu soru dağılım tabloları"** (alternatif **senaryolar**) yayımlıyor. Zümre bir senaryo seçip öğrencilere **önceden duyuruyor**. Her senaryo belirli **öğrenme çıktılarını** ve soru sayılarını içeriyor.
- Zümre, senaryodaki **iki öğrenme çıktısı için iki açık uçlu soru ve puanlama anahtarını** kendi yazıyor; kalan sorular sistemdeki **soru havuzundan** (açılışta ~8 bin soru; her dönem ~8 bin yeni soru hedefi) geliyor. Güçlük: kolay/orta/zor; zümre havuzdan en fazla 2 soruyu gerekçeyle değiştirebiliyor.
- Puanlar **soru bazlı e-Okul'a** işleniyor; öğrenci/sınıf/şube düzeyinde **öğrenme çıktısı analizi** yapılıyor. **Toplu liste yok, okullar/sınıflar arası karşılaştırma yok.**
- Sistem **Yeni EBA** (eba.gov.tr) üzerinden, 26 Ekim 2026'dan beri açık. 1. dönem 1. yazılılar **3-13 Kasım 2026'da** tamamlandı; mazeret sınavları 23-27 Kasım.

### 2.3 Ülke geneli ortak yazılı sınavlar — **resmî**, 10 Eylül 2026
- 6, 7, 9, 10. sınıfta toplam 8 sınav (açık uçlu): D1 — 6. Matematik, 10. Türk Dili ve Edebiyatı, 7. Türkçe, 9. Matematik; D2 — 7. Matematik, 9. Türk Dili ve Edebiyatı, 6. Türkçe, 10. Matematik.
- Tarihler: 11-12 Kasım 2026, 5-6 Ocak 2027, 6-7 Nisan 2027, 8-9 Haziran 2027. Toplu liste ve karşılaştırma yok.

### 2.4 LGS ve YKS
- **LGS 2027: 13 Haziran 2027.** **YKS 2027: 19-20 Haziran 2027** (ÖSYM). *(Tarihler basın/ÖSYM duyurusu.)*
- **Sınav yapısı 2027'de değişmiyor.** MEB (Aralık 2025): yeni müfredata uyumlu **beceri ve bağlam temelli çoktan seçmeli soru modeli 2028'de** devreye girecek; ÖSYM ile soru modellemesi çalıştayları ve pilotlamalar yapıldı. MEB bunun "sınav sistemi değişikliği değil, soru modeli çalışması" olduğunu vurguluyor. *(Bir basın kaynağı "2027'de yeni tip soru" diyor; MEB'in resmî açıklamasıyla çelişiyor, güvenilmez sayıldı.)*
- Temmuz 2026'da LGS'yle öğrenci alan okulların başvuru/değerlendirme takvimi değişti (Ocak'ta başvuru; Mayıs sonuna kadar onay). Sınavın kendisini değil okul süreçlerini etkiliyor.

### 2.5 2026-2027 Genelgesi — Pratium'u doğrudan ilgilendiren hükümler *(resmî)*
- *"Bakanlıkça belirlenen ortak sınav uygulamaları ile Bakanlık tarafından hazırlanan ölçme ve değerlendirme araçları dışında … öğrencileri birbirleriyle yarıştıran, sıralamaya tabi tutan ya da velilere ilave mali yük getiren **deneme sınavı, hazır bulunuşluk uygulaması, tarama sınavı** ve benzeri sınavların **okullarda** uygulanmasına veya öğrencilere satın aldırılmasına izin verilmeyecek. Özel yayınevleri veya diğer kişi ve kuruluşlar tarafından hazırlanan sınavlar da aynı kapsamdadır."*
- *"**Ödev verme ya da bilgilendirmelerde Bakanlığın belirlediği dijital platformlar/uygulamalar haricindeki araçların kullanımından kaçınılarak** bu hususta öğrencilere ve velilere gerekli yönlendirmeler yapılacak."*
- *"Okullarda **yönlendirme, reklam ve tanıtım organizasyonlarına** kesinlikle müsaade edilmeyecek"*; sınıfta cep telefonu kullanımı yasak (öğrenci ve öğretmen).
- OYSS Kılavuzu: sınav sorularının **görüntülerinin alınmaması, kopyalanmaması, paylaşılmaması**; gizliliğe aykırı davranışa adli/idari işlem.

### 2.6 MEBİ / Yeni EBA *(basın)*
MEB kendi yapay zekâ destekli bireysel öğrenme platformu MEBİ'yi (yaklaşık 5,7 milyon kullanıcı) ve yapay zekâ destekli Yeni EBA'yı yaygınlaştırıyor. Öğrenciye "Bakanlığın kendi aracı" alternatifi var; Pratium'un farkı kişiselleştirme derinliği, çok dilli destek ve veli/öğrenci odağı olmak zorunda.

---

## 3. Platform denetimi

### 3.1 Müfredat ve kazanım kataloğu (canlı veri tabanı)

| Sınıf | Kazanım (aktif) | Ders sayısı |
|---|---|---|
| 1 | 94 | 3 |
| 2 | 258 | 4 |
| 3 | 287 | 5 |
| 4 | 316 | 6 |
| 5 | 422 (405 aktif) | 6 |
| 6 | 453 | 6 |
| 7 | 487 | 6 |
| 8 | 482 | 6 |
| 9 | 467 | 9 |
| 10 | 474 | 10 |
| 11 | 488 | 12 |
| 12 | 365 | 11 |

- Toplam **4.593** kayıt; **3.816'sı MEB-2026-2027 sürümüne bağlı (kaynak: meb)**, 760'ı yabancı müfredat (İngiltere DfE 532, Avustralya ACARA 228; ülke bazlı ayrı sürümler). Aktif kayıtların neredeyse tamamı **doğrulanmış (verified)**; 15 kayıt "candidate".
- **Maarif öğrenme çıktısı kodları mevcut**, ör. 7. sınıf Fen: `FB.7.1.1 — Uzay araştırmaları için geliştirilen teknolojileri karşılaştırabilme`. OYSS kazanım tablolarıyla aynı kod düzeni.
- OYSS ders listesindeki tüm dersler 5-6-7 ve 9-10-11. sınıflar için katalogda **var**.
- **Boşluklar:**
  - 5. sınıf Matematik: yalnızca **6** MEB kazanımı (6. sınıf 24, 7. sınıf 30). Eksik görünüyor; resmî programla karşılaştırılmalı.
  - 11. sınıf "Temel Matematik" 6; 8. sınıf Matematik 23 (eski program; 2027-2028'de Maarif'e geçecek).
  - **2027-2028 MEB sürümü** (`draft`) **içeriksiz**. 4, 8, 12. sınıf Maarif programları açıklandığında içe aktarılmalı. (Sürüm/yaşam döngüsü altyapısı hazır: `docs/CURRICULUM_VERSIONING_OBJECTIVE_LIFECYCLE_V1.md`.)

### 3.2 Soru bankası (onaylı, raporsuz)

| Sınıf | Onaylı soru | Şekilli | Kazanıma bağlı |
|---|---|---|---|
| 5 | 470 | 30 | 233 |
| 6 | 932 | 84 | 554 |
| 7 | 485 | 7 | 367 |
| 8 | 202 (181 + 21) | 0 | 153 |
| 9 | 701 | 93 | 662 |
| 10 | 26 | 0 | 0 |
| 11 | **0** | – | – |
| 12 | 3 | 0 | 0 |

- Toplam **2.827** onaylı soru. **11. sınıf (Maarif'in bu yıl başladığı düzey) ve 10. sınıf neredeyse boş.**
- 6-7-9. sınıf bankasında ders dağılımı Matematik/Fen ağırlıklı; **Türkçe 71, Din Kültürü 32, İngilizce 29**.
- Şekilli soru oranı düşük (özellikle 7. sınıf: 485'te 7). Geometri %90 görsel kuralı için bankadan çekim 6. sınıfta mümkün, 7. sınıfta değil (ödev ekranında "yapay zekâ ile oluştur" yedeği var).
- **Yeni nesil/beceri temelli** üretim kuralları, görsel kotaları ve doğrulanmış kazanım eşlemesi üretim hattında mevcut. Banka eksiği, canlı yapay zekâ üretimiyle telafi ediliyor; ancak onaylı/doğrulanmış içerik oranı bu düzeylerde düşük.

### 3.3 Maarif Modeli soru tipleri
- Çoklu D/Y ve **tablo doldurma "MM" (Maarif Modeli) etiketli**; eşleştirme, sıralama, kısa cevap, boşluk doldurma ve karma tipler var. Ödevlerde çoklu tip seçimi yapılabiliyor (sıralama hariç).
- **Görsel kuralı:** sayısal derslerde ≥%30, yeni nesilde ≥%50, **geometride ≥%90**; fotoğraf/illüstrasyonlu şekiller için kabul ve üretim kuralları (PR 148). → MEB'in bağlam/şekil temelli yaklaşımıyla uyumlu.

### 3.4 Yazılı hazırlık özellikleri — OYSS karşılaştırması

**A) "Yazılıya Hazırlanıyorum" (yönetici setleri)** — canlı veri:

| Sınıf | Dersler (yayında; 1. dönem, 1. yazılı) | Soru | Kazanım kodlu |
|---|---|---|---|
| 5 | Din Kültürü (7), Fen (11), Sosyal Bilgiler (12) | 30 | 30 |
| 6 | Fen (12), Sosyal Bilgiler (7), Türkçe (6) | 25 | 25 |
| 7 | Fen (7), Türkçe (7) | 14 | 14 |
| 9 | Biyoloji (5), Din Kültürü (6), Fizik (7), Tarih (7) | 25 | 25 |

Toplam **12 yayında set**, hepsi **100 puan**; **her soruda `objective_code` dolu**. Kullanım henüz çok az (5 deneme, 2 tamamlanmış).

**B) Açık uçlu senaryo kartları (AUS)** — yalnızca 7. sınıf, 1. dönem: Fen (9 soru), Matematik (22), Sosyal Bilgiler (5), Türkçe (10); kazanım alanı yok.

| OYSS öğesi | Pratium | Durum |
|---|---|---|
| Senaryo → açık uçlu soru | Ders → dönem → senaryo; çok soru, şekil, doldurulabilir tablo (AUS) | 🟢 |
| Puanlama anahtarı (ölçüt, puan) | Rubrik: ölçüt + puan + tam puan koşulu; yapay zekâ ile puanlama; öğretmen düzeltebilir | 🟢 |
| Öğrenme çıktısına bağlı soru | **Yazılı setlerinde var (%100)**; AUS kartlarında yok | 🟡 |
| 100 tam puan | Yazılı setleri 100 puan; AUS'ta 100 üzerinden | 🟢 |
| Soru bazlı puan | Soru bazlı puan ve test ortalaması | 🟢 |
| Zümre: iki soru + anahtar kendisi yazar | Öğretmen manuel/yapay zekâ ile soru-rubrik yazar; onaylı AUS soru havuzu | 🟢 |
| Kâğıt üzerinde yazılı | Basılı döküm, QR, fotoğraf/taramadan toplu aktarım | 🟢 |
| Güçlük (kolay/orta/zor) | Yazılı/AUS'ta güçlük etiketi yok (test tarafında var) | 🟡 |
| 40 dk, ≤4 sayfa biçimi | Süre ve sayfa sınırı yok | 🟡 |
| Resmî "konu soru dağılım tablosu" senaryolarıyla eşleme | Yok | 🔴 |
| Matematik ve 10-11. sınıf | **Yazılı setlerinde Matematik hiç yok**; 10-11. sınıf yok | 🔴 |
| e-Okul'a soru bazlı giriş | Entegrasyon yok (kapalı sistem); öğretmen için dışa aktarım yok | 🟡 |

Ülke geneli ortak yazılıların ders-sınıf listesiyle kıyas: **6. Matematik, 7. Matematik, 9. Matematik, 10. Matematik, 9. ve 10. Türk Dili ve Edebiyatı** için yazılı seti **yok**; **6. ve 7. Türkçe** için set var (6. Türkçe, 7. Türkçe); 7. sınıf Matematik yalnızca AUS kartında var.

### 3.5 Sınav simülasyonu
- Yapı resmî düzenle uyumlu: **LGS** 90 soru (Türkçe 20, İnkılap 10, Din 10, İngilizce 10, Matematik 20, Fen 20), sözel 75 + sayısal 80 dk, 3 yanlış 1 doğruyu götürür; **TYT** 120 soru/165 dk; **AYT** 80 soru/180 dk, alan bölümleri; **YDT** 80 soru/120 dk; YKS'de 4 yanlış 1 doğru.
- Sınıfa göre görünürlük (6-8: LGS; 10+: TYT/AYT/YDT) uygulandı.
- **Eksik:** `EXAM_YEAR = 2026` sabit; 2027 tarihleri/geri sayım yok. "Pratik puanı (resmî sonuç değildir)" uyarısı var (iyi).
- **LGS müfredat sürümü** `MEB-2018-8-sinif` ve YKS `MEB-kademeli-2026-12-sinif`: 2027 sınavları için doğru (eski program). 2028 için yeni sürüm gerekecek.

### 3.6 Öğretmen ödev/sınıf araçları ve genelge
- Platformda öğretmen için **Ödev Ata**, sınıf analizi, basılı döküm ve kâğıt aktarma var. Genelge, ödevde Bakanlık dışı platformlardan kaçınılmasını ve Bakanlık dışı "deneme/hazır bulunuşluk" sınavlarını **okullarda** yasaklıyor.
- **Sıralama ekranı** ("Sıralama & Rozetler") topluluk geneli ve düzey bazlıdır; kod incelemesine göre **okul/sınıf bazlı yarıştırma yok** (iyi). **Canlı Quiz** sınıf içi yarışma niteliği taşıyabilir → genelge çerçevesinde dikkat.
- Resmî sınav gizliliği: öğrencinin **kendi çalışma kâğıdını** yüklemesi sorun değil; fakat **resmî OYSS/ülke geneli sınav kâğıtlarının** veya havuz sorularının yüklenmesi/transkribe edilmesi Kılavuz'un "görüntü alınmaması, paylaşılmaması" hükmüyle çatışır. Platformda bunu engelleyen uyarı **yok**.

### 3.7 Marka ve beyan
- "MEB müfredatına sadık" ifadesi (Hakkımızda) var; "MEB ile bağlantılı değildir / resmî sonuç değildir" beyanı yalnızca sınav simülasyonu sonuç ekranında. MEB/LGS/YKS/OYSS adlarının kullanımında **bağlantı ve onay çağrışımı** doğurmayacak standart bir beyan önerilir.

---

## 4. Risk ve boşluk matrisi

| # | Konu | Önem | Öneri | Efor |
|---|---|---|---|---|
| 1 | Okullarda ödev/deneme politikası (Genelge) | 🔴 Yüksek | Hukuki görüş; öğretmen araçlarını "isteğe bağlı destek, okul dışı çalışma" olarak konumlandır; metinlerde "deneme sınavı", okul/sınıf geneli sıralama ifadelerinden kaçın; okullarda tanıtım/reklam yapma | Hukuk + 1-2 gün metin |
| 2 | Resmî sınav gizliliği | 🟠 Orta-yüksek | Kâğıt/PDF yükleme ekranlarına "Resmî ortak yazılı sınav kâğıtlarını/sorularını yüklemeyin" uyarısı ve kullanım şartlarına madde; admin PDF aktarımında MEB sınav soruları için uyarı | 0,5 gün |
| 3 | Yazılı setleri: Matematik yok, 10-11. sınıf yok, yalnız 1. dönem 1. yazılı | 🟠 Orta-yüksek | Ülke geneli ortak yazılı dersleri öncelikli: 6/7/9/10. sınıf Matematik, 9/10. Türk Dili ve Edebiyatı; sonra 11. sınıf ve 2. yazılı/2. dönem | İçerik üretimi |
| 4 | AUS kartlarında kazanım alanı yok; resmî senaryo eşlemesi yok | 🟡 Orta | AUS'a `objective_code`; resmî konu soru dağılım tablolarındaki senaryolarla eşleme; sonuçlarda "öğrenme çıktısı bazlı güçlü/gelişim alanı" | 1-2 hafta |
| 5 | OYSS biçimi (40 dk, ≤4 sayfa, güçlük) ve e-Okul'a aktarım kolaylığı | 🟡 Orta | Yazılı setlerinde OYSS biçimli deneme (süre/sayfa), güçlük etiketi, öğretmen için soru bazlı puan CSV dışa aktarım | 1 hafta |
| 6 | 10-11. sınıf soru bankası boş | 🟠 Orta | Önce 11. sınıf (Maarif ilk yıl) ve 10. sınıf için kazanım bağlı üretim + onay hattı; Türkçe/Din/İngilizce takviyesi | Süreç + üretim |
| 7 | 5. sınıf Matematik kazanımları (6) | 🟡 Orta | Resmî programla karşılaştır, eksik öğrenme çıktılarını içe aktar | 0,5-1 gün |
| 8 | Sınav yılı 2027 | 🟡 Düşük | `EXAM_YEAR` → 2027, LGS 13 Haziran / YKS 19-20 Haziran geri sayımı | 0,5 gün |
| 9 | 2027-2028 Maarif sürümü (4, 8, 12) | 🟡 Orta (zamanlı) | Taslak programlar yayımlanınca import; 8. sınıf için yeni LGS müfredat sürümü; 12. sınıf YKS sürümü | 2027 |
| 10 | 2028 beceri temelli LGS/YKS soru modeli | 🟡 İzleme | MEB/ÖSYM pilot çıktıları yayımlandıkça sınav simülasyonu soru üretim kurallarını güncelle | Süreklilik |
| 11 | Marka beyanı | 🟡 Düşük | "MEB ile bağlantılı değildir; resmî sonuç değildir" standart metni (footer + sınav ekranları) | 0,5 gün |
| 12 | Rakip/çevre: MEBİ, Yeni EBA | ℹ️ Stratejik | Ürün mesajı: kişiselleştirme, çok dil, veli; MEB araçlarıyla çakışma yerine tamamlayıcı konum | Strateji |

---

## 5. Önerilen yol haritası

**Bu hafta**
1. Hukuki görüş talebi (madde 1 ve 2) ve kullanım şartları/uyarı metinleri.
2. Marka beyanı + kâğıt yükleme uyarısı + `EXAM_YEAR`/tarih güncellemesi (düşük riskli, kod tarafı kısa).

**1-4 hafta**
3. Yazılı setlerinde ülke geneli sınav dersleri (6/7/9/10. Matematik, 9/10. TDE) ve AUS'ta `objective_code` + resmî senaryo eşlemesi.
4. OYSS biçimli deneme modu (40 dk, ≤4 sayfa, güçlük) ve soru bazlı puan çıktısı (CSV).
5. 10-11. sınıf soru bankası ve 5. sınıf Matematik kazanım tamamlama.

**2027**
6. 2027-2028 MEB sürümü (4, 8, 12) hazırlığı; 8. sınıf LGS ve 12. sınıf YKS sürümleri.
7. 2028 beceri temelli sınav modeli için sınav simülasyonu v2.

---

## 6. Doğrulanamayan / açık noktalar
- 4, 8, 12. sınıfların 2027-2028'de Maarif'e geçişi **tek kaynaklı basın bilgisi**; resmî duyuru beklenmeli.
- Resmî **konu soru dağılım tabloları** (senaryolar) bu raporda incelenmedi; Genel Müdürlük'ün yayımladığı tabloların güncel hâli ve kullanım koşulları teyit edilmeli.
- LGS 2027 ve YKS 2027 **kılavuzları** henüz yayımlanmadığı için ayrıntılar (başvuru, kapsam) son haliyle doğrulanamadı.
- 5. sınıf Matematik kazanım sayısının resmî program karşılığı ayrıca kontrol edilmeli.
- Genelge hükümlerinin Pratium gibi bağımsız bir platforma **doğrudan** yükümlülük getirip getirmediği (okul/öğretmen üzerinden dolaylı etki) hukuki teyide bağlı.

## Kaynaklar
**Resmî (meb.gov.tr / osym.gov.tr):**
- [Ülke Geneli Ortak Yazılı Sınav Takvimi Belli Oldu (10 Eylül 2026)](https://meb.gov.tr/ulke-geneli-ortak-yazili-sinav-takvimi-belli-oldu/haber/41874/tr)
- [Ortak Yazılı Sınav Sistemi Uygulama Kılavuzu Yayımlandı (20 Ekim 2026)](https://meb.gov.tr/ortak-yazili-sinav-sistemi-uygulama-kilavuzu-yayimlandi/haber/42228/tr) · [OYSS Uygulama Kılavuzu (PDF)](https://www.meb.gov.tr/meb_iys_dosyalar/2026_10/6ad703eb1bb29010473792_Ortak_Yazili_Sinav_Sistemi_OYSS_Uygulama_Kilavuzu.pdf) · [Okul Geneli OYSS Uygulama Takvimi (PDF)](https://www.meb.gov.tr/meb_iys_dosyalar/2026_10/6ad703df743f8654049216_Okul_Geneli_Ortak_Yazili_Sinav_Sistemi_Uygulama_Takvimi.pdf)
- [2026-2027 Eğitim ve Öğretim Yılına İlişkin İş ve İşlemler Genelgesi](https://meb.gov.tr/2026-2027-egitim-ve-ogretim-yilina-iliskin-is-ve-islemler-konulu-genelge-yayimlandi//haber/41673/tr)
- [YKS ve LGS'de yeni müfredata uyumlu soru modeli 2028'de hayata geçecek (15 Aralık 2025)](https://meb.gov.tr/yks-ve-lgsde-yeni-mufredata-uyumlu-soru-modeli-2028de-hayata-gececek/haber/39265/tr)
- [MEB Ortaöğretim Kurumları Yönetmeliği değişikliği (3 Temmuz 2026)](https://meb.gov.tr/meb-ortaogretim-kurumlari-yonetmeliginde-degisiklik-resmi-gazetede-yayimlandi/haber/41277/tr)
- [ÖSYM: YKS 19-20 Haziran 2027'de yapılacak](https://osym.gov.tr/yks-19-20-haziran-2027de-yapilacak)

**Basın (resmî teyit gerektirir):**
- [Okullarda yeni müfredat hangi sınıfları kapsıyor? (internethaber)](https://www.internethaber.com/okullarda-yeni-mufredat-hangi-siniflari-kapsiyor-turkiye-yuzyili-maarif-modeli-nedir-2459609h.htm)
- [LGS 13 Haziran'da yapılacak (Sabah)](https://www.sabah.com.tr/egitim/lgs-13-haziranda-yapilacak-7691869)
- [MEB'den yapay zeka destekli Yeni EBA (NTV)](https://ntv.com.tr/egitim/mebden-yapay-zeka-destekli-yeni-eba-1748366)
- [MEBİ 2025-2026'da 6 milyona yakın kullanıcıya ulaştı (MEB)](https://www.meb.gov.tr/mebi20252026egitimogretimyilinda6milyonayakinkullaniciyaulasti/haber/41439/tr)
