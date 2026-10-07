# Pratium Yol Haritası — Ekim–Aralık 2026

Kaynak: *Pratium — Durum ve Geliştirme Raporu (7 Ekim 2026)*. Rapor, canlı veriyi ölçmediğini belirtiyordu; bu yol haritası raporun iddialarını kodda ve canlı veritabanında (7 Ekim) kontrol ederek hazırlandı.

**Tek cümlelik yön:** Önce "ölçtüğümüzü sandığımız" şeyleri gerçekten ölçür hale getir (veri bütünlüğü, dürüst güvenlik göstergeleri, izin), sonra ilk eksiksiz öğrenme döngüsünü kanıtla, en son okula gösterilecek tek kanıt raporunu ve kontrollü pilotu kur.

## 1. Rapor iddiaları — doğrulama sonucu

| # | Rapor iddiası | Sonuç | Kanıt |
|---|---|---|---|
| 1 | Katalog `.limit(10000)` ile okunuyor; bütün satırlar gelmeyebilir, bazı dersler 0 konu kalabilir | **Büyük olasılıkla doğru, kesinleşmedi** | `app/api/admin/curriculum/route.ts` iki yerde `limit(10000)`. Katalogda 3622 satır var. Supabase proje düzeyinde `max_rows` (varsayılan 1000) `.limit()`'i aşar; ayar değerini SQL'den okuyamadım. Konusuz aktif kazanım **0**, yani sorun veride değil okumada. |
| 2 | Güvenlik kartı gerçek güvenlik ölçümü değil | **Doğru** | `ai-safety-scorecard/route.ts`: gizlilik puanı sabit `100`; onay kaydı yoksa insan gözetimi `100`; engellenen çıktı arttıkça içerik güvenliği `70 + 5×engellenen` (en çok 100). |
| 3 | Veli onayı oturumdaki kullanıcıyla kabul edilebiliyor | **Doğrulandı (kısmen)** | `auth/consent-status/route.ts` yorumunda `veli_onayi` kaydının önündeki kontrole dayandığı ve `granted: true` yazıldığı belirtiliyor. Gerçek veli kimliğiyle bağlama yok. |
| 4 | Onaylı mikro içerik koç akışına bağlı değil | **Doğru** | Tablo `misconception_micro_contents`. Yalnızca `admin/misconception-micro-content` ve `agents/review-plan` kullanıyor; `coach/*` rotalarında referans yok. |
| 5 | Sonraki kazanım kuralları eksik sürümü kabul ediyor | **Kod doğru, canlı etkisi şimdilik düşük** | `lib/next-objective.ts` sürüm `null` ise kabul ediyor. Ancak aktif doğrulanmış 3622 kazanımın **0'ında** sürüm eksik. Kenar (edge) tarafı ölçülmedi. |
| 6 | Tamamlanmış gerçek öğrenme döngüsü kanıtı yok | **Doğru** | `learning_transfer_checks`: tamamlanmış **0**, bekleyen 35. |

Bu oturumda tamamlananlar (yol haritasının girdisi): transfer kontrolü kullanılabilirlik göstergesi ve dashboard sayacı; uygun soru boşluğu raporu; yanılgı kümeleme önerileri + uzman onayı + günlük cron; admin sekme düzeni (Learning Graph).

## 1b. İlerleme durumu (güncelleme: 7 Ekim, akşam)

| İş | Durum |
|---|---|
| 0.1–0.4 | **Tamam** (PR #6): katalog sayfalama, kapsam raporu, tek eşleştirme tanımı, dürüst güvenlik kartı. Max rows = 1000 doğrulandı. |
| 0.5 | **Tamam** (PR #7): `e2e` kırığı 5 Ekim'deki `c035f0d` yeniden düzenlemesinden kalan bayat kaynak-metin beklentileriydi; kod davranışı değişmemişti. |
| 0.1b | **Tamam**: 1000 satırda kesilen diğer admin/analitik okumaları `readAll` ile tamamlandı (AI maliyet logları, ajan denetimi, koç kullanımı, pipeline sağlığı, risk ekranları, sınıf/kurum listeleri). |
| 0.6 | **Bekliyor**: sağlayıcı maliyeti ve anahtar kararı. |
| Faz 1 | **Askıda** (kullanıcı kararı). Etkisi: Faz 4'te "izin" halkası boş kalır, Faz 5 pilotu izinsiz başlatılamaz. |
| 2.2 | **Tamam**: `Öğrenme Döngüsü Zincir Denetimi` paneli (Learning Graph sekmesi). Bulgular aşağıda. |

**2.2 bulguları (canlı veri, 7 Ekim):** 3 döngü var ve üçü de **tek öğrenci ve tek öğretmene** ait (26 öğrencinin olay kaydı var; 7 günde 2 aktif öğrenci). Üç döngüde ön test, rehberli çalışma ve son test tamamlanmış. Bir döngüde (kazanım …`94bafaa8`) aktarım testi de tamamlanmış (ön %40 → son %80 → aktarım %100); bu döngüde **eksik tek halka öğretmenin aktarım incelemesi**. Diğer ikisinde ilk eksik halka öğretmen ön/son incelemesi. Gecikmeli tek maddelik kontroller (`learning_transfer_checks`, 35 kayıt, 0 tamamlanmış) bu döngülerle **bağlı değil**: döngülerin kazanımları için hiç kontrol planlanmamış, yani iki "aktarım" hattı ayrı çalışıyor. Aktarım testi son testten ~1 gün sonra yapılmış; "gecikmeli" kanıt için süre ölçütü tanımlı değil.

## 2. Önceliklendirme ilkeleri
1. **Dürüstlük önce:** bir gösterge ölçülmüyorsa "ölçülmedi" yazar; yüksek puan göstermez.
2. **Zincirin her halkası aynı kazanımda:** ön test → müdahale → son test → öğretmen incelemesi → gecikmeli aktarım.
3. **Birincil sonuç yardımsız ölçümdür:** mastery tahmini veya öğretmen incelemeli sonuç birincil kanıt değildir.
4. **İnsan kararı kaynak gerekçeye bağlıdır.**

## 3. Fazlar

Efor: **S** ≤ 2 gün, **M** 3–7 gün, **L** 1–3 hafta (tek geliştirici tahmini).

### Faz 0 — Temel bütünlük ve dürüst göstergeler (Hafta 1–2)

| İş | Efor | Tamamlanma ölçütü |
|---|---|---|
| 0.1 Katalog okumasını sayfalamak (`range()` ile döngü) ve tek ortak yardımcıya taşımak; `curriculum`, `learning-graph-suggest` ve benzeri tüm `limit(10000)` kullanımları | S | Tüm 3622 satır okunuyor; test, `max_rows=1000` simülasyonunda da geçiyor. |
| 0.2 Ders başına **kapsam raporu**: kazanım sayısı, konusu eşleşen / eksik / belirsiz, 0-konu nedeni; güncel / eski / inceleme bekleyen ayrı | M | Admin'de tek tablo; her dersin 0-konu nedeni yazılı. |
| 0.3 Sınıf/ders anahtarlarını ortaklaştırmak (şu an iki yerde ayrı `key`/`gradeKey`) | S | Tek modül, birim testli. |
| 0.4 Güvenlik kartı: ölçülmeyen alan = "ölçülmedi"; puan paydası, kapsam, son değerlendirme tarihi | S | Gizlilik sabiti kalktı; onay kaydı yoksa gözetim puanı yok; her puanın yanında pay/payda ve tarih. |
| 0.5 Önceden kırık `e2e` testi (`exam-upload` → `source_type !== 'anonymous'`): kod mu test mi eskimiş karar ver ve düzelt | S | `main`'de `e2e` yeşil; ~20 push'tur kırmızı, gerçek regresyonları maskeliyor. |
| 0.6 Transfer kontrolü soru boşluğu: gap raporundaki 10 kazanım için soru üretimi (mevcut iki denetçili hat) | M | Bekleyen 35 kontrolün tamamı sunulabilir (şu an 23). |

**Çıkış:** "0 konu" sorunu ya kapanır ya da nedeni kayıt altında açıklanır. `main` yeşil.

### Faz 1 — Veli yetkisi ve AI kullanım izni (Hafta 2–4)

| İş | Efor | Tamamlanma ölçütü |
|---|---|---|
| 1.1 Hukuki/KVKK girdisi: 18 yaş altı için kimin, hangi kapsamda izin verdiği | — (karar) | Yazılı gereksinim. |
| 1.2 `veli_onayi` yalnızca doğrulanmış veli–çocuk bağlantısı (`parent/link-child`) üzerinden yazılır | M | Öğrenci hesabıyla veli onayı yazılamaz; test var. |
| 1.3 İzin durumu AI çağrı noktalarında uygulanır (koç, soru üretimi, öneriler): izin yoksa çağrı yapılmaz ve nedeni kaydedilir | L | İzinsiz öğrenci için model çağrısı 0; denetim kaydında "izin yok" görünür. |

**Bağımlılık:** 1.1. **Risk:** Mevcut kullanıcıların izin durumunun geri dönük yönetimi.

### Faz 2 — İlk eksiksiz öğrenme döngüsü (Hafta 3–6)

| İş | Efor | Tamamlanma ölçütü |
|---|---|---|
| 2.1 Pilot öğrencilerle bekleyen transfer kontrollerini tamamlatmak (23 sunulabilir; dashboard sayacı hazır) | S | Tamamlanmış transfer kontrolü > 0, mastery'ye yazıldığı doğrulanmış (`apply_transfer_check_to_mastery_v1`). |
| 2.2 Tek öğrenci + tek kazanımda **tam zincir** denetimi: ön test, müdahale, son test, öğretmen incelemesi, gecikmeli aktarım | M | Zincirin her halkası için kayıt ve zaman damgası; eksik halka raporu. |
| 2.3 Sonraki kazanım planlayıcısı: sürüm eksikliğini kabul etme kuralını sıkılaştır; ön koşul kenarlarında sürüm kapsamını ölç | M | `null` sürüm kenarı değerlendirmeye girmiyor veya açıkça işaretleniyor. |
| 2.4 Öğretmenin seçtiği sonraki kazancın yeni döngüyü başlatması (uçtan uca) | M | Seçimden yeni ön teste geçiş kaydı. |

**Çıkış:** Gösterilebilir ilk eksiksiz döngü. Not: Bu faz **gerçek öğrenci katılımına** bağlıdır; kod tek başına tamamlamaz.

### Faz 3 — Öğrenci düzeyinde yanılgı incelemesi ve mikro içerik (Hafta 5–8)

| İş | Efor | Tamamlanma ölçütü |
|---|---|---|
| 3.1 Öğrenci düzeyi karar: **destekleniyor / desteklenmiyor / kanıt yetersiz**; kazanım ve kaynak yanıtlarla birlikte saklanır (yeni tablo + öğretmen ekranı) | L | Her karar bir yanıt kaydına ve gerekçeye bağlı. |
| 3.2 Kümeleme önerilerinin (bu oturumda yapıldı) öğrenci düzeyi kararla birleşmesi: kanonik yanılgı yalnızca destekleniyor kararından sonra öğrenci profiline yazılır | M | Katalog onayı ≠ öğrenci onayı ayrımı arayüzde görünür. |
| 3.3 Onaylı mikro içeriği koç / rehberli çalışmaya bağlamak (kazanım + yanılgı sinyaline göre seç) | L | Sunulan içerik sürümü, öğrenci yanıtı ve sonraki yardımsız ölçüm kaydedilir. |

### Faz 4 — Okul kanıt ve yönetişim raporu (Hafta 8–10)

| İş | Efor | Tamamlanma ölçütü |
|---|---|---|
| 4.1 Zincir görünümü: izin → model çağrısı → müdahale → öğretmen kararı → ölçüm sonucu | L | Bir öğrenci/kazanım için tek ekranda tüm zincir. |
| 4.2 Okul yöneticisi için tek rapor (PDF/ekran), "ölçülmedi" alanları açık | M | Rapor yalnızca ölçülmüş verileri iddia eder. |

### Faz 5 — Kontrollü okul pilotu (Hafta 10–14)

| İş | Efor | Tamamlanma ölçütü |
|---|---|---|
| 5.1 Ön kayıtlı birincil sonuç: **doğrudan yardımsız ölçüm** | S | Analiz planı pilottan önce kilitli. |
| 5.2 Karşılaştırma grubu, kayıp katılımcı ve belirsizlik raporlaması | M | Rapor aralıklarla ve kayıp oranıyla yayınlanır. |

**Bağımlılık:** Faz 1, Faz 2, Faz 4. Okul ve veli anlaşmaları teknik iş değildir; erken başlatılmalı.

### Faz 6 — Benchmark ve maliyet temelli yönlendirme (paralel, düşük öncelik)

| İş | Efor | Tamamlanma ölçütü |
|---|---|---|
| 6.1 Benchmark kapsamı: ders, sınıf, görsel ve soru türü | L | Kapsam matrisi; yanlış kazanım etiketleri ayrı raporlanıyor. |
| 6.2 Görev bazında kalite/güvenlik/süre/maliyet eşiği ve yeni sağlayıcı kabul süreci | M | Yönlendirme kararı ölçülmüş eşiğe bağlı. |

## 4. Sıra özeti

```
Hafta:  1   2   3   4   5   6   7   8   9  10  11  12  13  14
Faz 0   ███ ███
Faz 1       ███ ███ ███
Faz 2           ███ ███ ███ ███
Faz 3                   ███ ███ ███ ███
Faz 4                               ███ ███ ███
Faz 5                                       ███ ███ ███ ███ ███
Faz 6   (boşluk buldukça, paralel)
```

## 5. Riskler ve açık sorular
- **Satır sınırı:** `max_rows` değeri doğrulanmadı. Faz 0.1 öncesi Supabase ayarı kontrol edilmeli; sayfalama her durumda doğru çözümdür.
- **Pilot katılımı:** Faz 2 ve 5 gerçek öğrenci kullanımına bağlı; kod sürelerinden bağımsız gecikebilir.
- **Hukuki girdi:** Faz 1.1 gecikirse 1.2/1.3 bekler.
- **Soru üretimi maliyeti:** Faz 0.6 ve Faz 6 sağlayıcı maliyeti getirir; bütçe onayı gerekir.
- **Kırık `e2e`:** 0.5 yapılana kadar yeni push'larda gerçek regresyon sinyali zayıf.
- **Ölçülmeyenler:** Canlı öğrenci/pilot sayıları, ön koşul kenarlarının sürüm kapsamı ve `misconception_micro_contents` onaylı sayısı bu çalışmada ölçülmedi.

## 6. Önerilen ilk adım
Faz 0.1–0.4'ü tek PR'da (katalog sayfalama + kapsam raporu + güvenlik kartı), 0.5'i ayrı küçük PR'da yapmak. Sonuçları üretimde görmeden Faz 1'e geçilmemeli.
