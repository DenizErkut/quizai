# PRATIUM — Model Benchmark Planı (Aşama 5)

Tarih: 24 Kasım 2026. Bu belge bir **ölçüm tasarımıdır**. Açık modeller için hiçbir ölçüm yapılmadı; aşağıdaki "açık model" hücreleri bilinçli olarak boştur. Dolu olan tek veri, üretim `ai_usage_logs` tablosundan gelen **mevcut modellerin gerçek ölçümleridir**.

## 1. İlkeler

1. **Yalnız anonimleştirilmiş veya sentetik veri.** Gerçek öğrenci adı, e-posta, serbest metin cevap benchmark'a girmez. Öğrenci cevapları gerekiyorsa deterministik takma ad + PII temizliği + insan gözden geçirmesinden sonra kullanılır.
2. **Aynı girdi, aynı istem, aynı çıktı şeması** — tüm modeller aynı test paketini görür; yalnız sağlayıcı adaptörü değişir.
3. **Ölçülmeyen değer tahmindir ve öyle etiketlenir** (`ölçülmedi` / `tahmin`).
4. **Ucuz diye üretime alınmaz.** Kalite eşiği geçilmeden maliyet kazancı dikkate alınmaz (§6).
5. Mevcut altyapı yeniden kullanılır: MEB değerlendirme paketi (`docs/MEB-EVAL-SUITE-V1.md`, `app/api/admin/education-eval/run/route.ts`, `education_eval_ai_question_items`), `question_bank` (5.774 kayıt; onaylı olanlar altın veri), `ai_shadow_evaluations`/genelleştirilmiş gölge tablosu, `lib/ai-gateway/quality-engine.ts`.

## 2. Test kategorileri, veri ve puanlama

| # | Kategori | Test verisi (kaynak) | Altın etiket | Metrik |
|---|---|---|---|---|
| 1 | MEB kazanım doğruluğu | `question_bank`'taki **onaylı** kazanım eşleşmeleri (örnekleme, sınıf/ders dengeli) | Onaylı `objective_code` | Top-1 / Top-3 doğruluk; yanlış-pozitif oranı |
| 2 | Türkçe dil kalitesi | Sentetik 200 istem (ders anlatımı, soru metni, geri bildirim) | 3 insan değerlendirici (1–5), kör | Ortalama puan, değerlendirici uyumu (Krippendorff α) |
| 3 | Matematiksel doğruluk | Sentetik/serbest lisanslı sayısal sorular; cevap **CAS ile hesaplanır** | CAS sonucu | Tam doğru oranı, sayısal sapma |
| 4 | Pedagojik açıklama kalitesi | Mevcut onaylı açıklamalar + yeni istemler | Öğretmen rubriği (doğruluk, adım adım, seviyeye uygunluk) | Rubrik puanı |
| 5 | Öğrenci seviyesine uygunluk | Sınıf seviyesi etiketli metinler | Öğretmen etiketi | Seviye uyumu %, okunabilirlik farkı |
| 6 | JSON şema uyumu | Tüm görevlerin çıktı şeması | Şema doğrulayıcı (otomatik) | Geçerli JSON %, **onarımsız** geçerlilik % |
| 7 | Hallucination | Doğrulanabilir olgu soruları + "bilgi yok" tuzakları (MEB'de olmayan kazanım) | Kaynak metin | Desteklenmeyen iddia oranı |
| 8 | Benzer soru tespiti | `question_bank` içinde insan işaretli tekrarlar + sentetik parafraz | Çift etiketi | Precision/Recall/F1 |
| 9 | Yanılgı sınıflandırma | `misconception_catalog` + uzman onaylı örnekler (`MISCONCEPTION-EXPERT-REVIEW-V1`) | Uzman etiketi | Makro F1, küme saflığı |
| 10 | Açık uçlu cevap değerlendirme | **Sentetik** öğrenci cevapları (iyi/orta/zayıf/yan konu) + öğretmen puanları | İnsan puanı | Puan korelasyonu (QWK), ortalama mutlak hata, sert hata oranı (≥ 2 puan sapma) |
| 11 | Çoklu dil | TR/EN (+ uygulamadaki diğer diller) eşdeğer istem çiftleri | İnsan | Dil başına kalite farkı |
| 12 | Gecikme | Sabit yük profili (tek istek + 10 eşzamanlı) | — | Ortalama, **p95**, ilk token süresi |
| 13 | İşlem başı maliyet | Gerçek token sayısı × güncel fiyat (`ai-pricing.ts`) | — | USD/istek, USD/1.000 istek |

Boyut: her kategori için en az 150 örnek (anlamlı fark için güven aralığı hesabı, §5). 10. kategori için ayrıca ≥ 100 öğretmen puanlı cevap şart.

## 3. Karşılaştırma tabloları (şablon)

Her model × görev için doldurulacak:

| Alan | Tanım |
|---|---|
| Quality score | Kategori puanlarının görev ağırlıklı ortalaması (ağırlıklar görev başına önceden sabitlenir) |
| Average latency | Başarılı çağrıların ortalama süresi |
| P95 latency | %95'lik süre |
| Cost per request | Gerçek token × fiyat |
| Cost per 1.000 requests | ×1.000 |
| Structured output success rate | Onarımsız şema-geçerli çıktı oranı |
| Failure rate | Hata + zaman aşımı + geçersiz çıktı / toplam |

### 3.1 Bugünkü modellerin **ölçülmüş** taban çizgisi (`ai_usage_logs`, 5 Eyl–24 Kas 2026)

Dikkat: maliyet/istek değeri modelin işlem karışımına bağlıdır (ör. Haiku büyük toplu istemlerde, GPT-4o çok kısa doğrulamada kullanıldı) — **modeller arası doğrudan kalite/maliyet kıyası için kullanılamaz**; yalnızca operasyonel taban çizgisidir.

| Model | Çağrı | USD/istek | USD/1.000 istek | Ort. süre | p95 süre | Yapılandırılmış çıktı başarısı | Hata oranı |
|---|---:|---:|---:|---:|---:|---|---|
| claude-sonnet-4-5 | 2.026 | 0,0142 | 14,15 | 8,5 sn | 20,9 sn | ölçülmedi | ölçülmedi |
| claude-sonnet-5-5 | 601 | 0,0184 | 18,44 | kayıt yetersiz | kayıt yetersiz | ölçülmedi | ölçülmedi |
| claude-haiku-4-5 | 476 | 0,0174 | 17,44 | 10,3 sn | 24,6 sn | ölçülmedi | ölçülmedi |
| gpt-4.1-mini | 3.776 | 0,0015 | 1,53 | 3,9 sn | 9,9 sn | ölçülmedi | ölçülmedi |
| gemini-3.6-flash | 1.543 | 0,0035 | 3,47 | kayıt yok | kayıt yok | ölçülmedi | `outcome` kaydı olan 137 çağrının tümü `provider_error` (toplam içindeki oran ölçülemiyor) |
| mistral-small-latest | 2.557 | 0,0008 | 0,75 | 5,3 sn | 12,0 sn | ölçülmedi | ölçülmedi |
| mistral-large-latest | 440 | 0,0037 | 3,70 | 13,1 sn | 35,0 sn | ölçülmedi | ölçülmedi |
| gpt-4o | 609 | 0,0013 | 1,35 | 1,0 sn | 2,0 sn | ölçülmedi | ölçülmedi |

"Ölçülmedi" hücreleri, `meta.outcome`/şema doğrulama kaydının yazılmamasından kaynaklanır → **P0 telemetri işi** (Uygulama Planı P0-2). Bunlar kapanmadan açık modellerle adil kıyas yapılamaz.

### 3.2 Açık modeller (henüz ölçülmedi)

| Model | Görev | Quality | Ort. gecikme | P95 | USD/istek | USD/1.000 | JSON başarı | Hata |
|---|---|---|---|---|---|---|---|---|
| bge-m3 | 1,3,7,8,9 | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | n/a | ölçülmedi |
| Qwen3-8B / Qwen3-235B-A22B | 2,4,5,6,9,13 | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi |
| Gemma 4 (E4B/31B) | 2,4,5,6,11,13 | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi |
| Mistral Small 3.x | 4,5,6,13 | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi |
| Phi-4-reasoning | 3 | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi |
| Whisper large-v3-turbo | STT | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | ölçülmedi | n/a | ölçülmedi |

## 4. Çalıştırma mimarisi (öneri; henüz kodlanmadı)

* `scripts/ai-benchmark/` altında bağımsız bir çalıştırıcı (üretim rotalarına dokunmaz). Girdi: veri seti sürümü + model listesi + sağlayıcı yapılandırması; çıktı: `reports/benchmark-<tarih>.json` ve Markdown özeti.
* Adapter'lar §Mimari'deki ortak arayüzü kullanır; sağlayıcıya özel kod yalnız adapter içinde.
* Sonuçlar üretim veritabanına değil, ayrı bir değerlendirme şemasına/dosyaya yazılır; ham içerik saklanmaz (yalnız metrik ve girdi kimliği).
* Maliyet `computeCostUsd()` ile hesaplanır; yeni fiyatlar tabloya "kaynak + tarih" notuyla eklenir.
* Rastgelelik sabit tohumla; her model 3 tekrar (sıcaklık > 0 ise) → değişkenlik raporlanır.
* Her koşu için model `revision` (commit SHA), sağlayıcı, istem sürümü ve veri seti hash'i kayda geçer.
* Ücretli çağrı bütçesi önceden onaylanır (ör. ilk tur için tavan USD); koşucu tavan aşılırsa durur.

## 5. İstatistik

* Kalite farkı: eşleşmiş bootstrap (10.000 yeniden örnekleme) ile %95 güven aralığı; ikili sonuçlarda McNemar.
* "Daha kötü değil" iddiası için **eşdeğerlik/ aşağı-olmama** sınırı önceden belirlenir (ör. Claude'a göre kalite düşüşü ≤ 2 puan, güven aralığının alt sınırı bu sınırı aşmamalı).
* Küçük örneklemde (n < 100) sonuç "yönlendirici, karar için yetersiz" diye etiketlenir.

## 6. Üretime alma eşikleri (kapılar)

Bir model bir görevde **üretim trafiği alabilmesi** için aşağıdakilerin **tümü** gerekir:

| Kapı | Eşik |
|---|---|
| Kalite | Mevcut üretim modelinden aşağı-olmama sınırını geçmek (§5); pedagojik görevlerde ek olarak **insan gözden geçirme** |
| Yapılandırılmış çıktı | Onarımsız geçerli JSON ≥ %99 (`MULTI_AI_GATEWAY_V3_IMPLEMENTATION.md` eşiğiyle uyumlu) ve bozuk interaktif alan oranı %0 |
| Hallucination | Mevcut modelden yüksek olmamak; "bilgi yok" tuzaklarında uydurma ≤ mevcut |
| Güvenlik | S2/S3 verisi yalnız onaylı yolla (bkz. Güvenlik) |
| Gecikme | p95 görev bütçesi içinde (öğrenci akışı için hedef ≤ 10 sn, toplu için serbest) |
| Hata oranı | Başarısız/geçersiz ≤ %1 (7 gün gölge) |
| Maliyet | Anlamlı tasarruf (≥ %30 görev maliyetinde) — **yalnız diğer tüm kapılar geçildiyse** değerlendirilir |
| Lisans | LICENSE dosyası arşivlenmiş ve hukukça onaylı |
| Onay | Elle onay kapısı (`Uygulama Planı`) |

Mevcut modelden daha düşük kaliteli bir model **yalnızca ucuz olduğu için** üretime alınmaz.

## 7. Aşamalı yürütme

1. **Hafta 0:** telemetri boşluklarını kapat (outcome/duration), altın veri setlerini çıkar ve PII taramasından geçir.
2. **Hafta 1–2:** yalnız T0/T1 (embedding) çevrimdışı koşular — maliyet ve risk en düşük; ücretli endpoint gerekmez (CPU/küçük GPU ya da Providers).
3. **Hafta 3–4:** T2 hakem görevleri gölge modunda (kullanıcı yanıtını etkilemez).
4. **Sonra:** T3 görevleri; açık uçlu puanlama en sonda ve yalnız insan puanlı altın setle.

Çıktılar: `reports/benchmark-*.json` + her model için tek sayfalık "Model Doğrulama Kartı" (lisans, revision SHA, güvenlik taraması, benchmark sonuçları, karar).
