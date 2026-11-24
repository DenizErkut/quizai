# PRATIUM — Maliyet Analizi (Aşama 6)

Tarih: 24 Kasım 2026. **Ölçülmüş** ve **varsayım** ayrımı her satırda belirtilmiştir. Büyük ölçek rakamları tahmindir; bunlar bütçe kararı değil, yön göstericidir.

## 1. Gerçek ölçümler (üretim `ai_usage_logs`, 5 Eyl → 24 Kas 2026 = 80 gün)

| Büyüklük | Değer |
|---|---|
| Toplam AI maliyeti | 63,54 USD (12.042 çağrı) |
| Aylık seyir | Eyl 32,16 · Eki 27,49 · Kas (24 gün) 3,88 USD |
| Öğrenci rolü (25 kullanıcı) | 36,00 USD |
| Öğretmen rolü (2 kullanıcı) | 3,65 USD |
| Kullanıcısız/sistem (toplu işler vb.) | 23,88 USD |
| Ürün çalışma zamanı | 44,11 USD · 14,9 M giriş + 2,9 M çıkış token |
| İçerik operasyonu (toplu/yönetici) | 19,42 USD · 25,4 M giriş + 3,4 M çıkış token |
| Aktif kullanıcı başına (60 gün, 26 kullanıcı) | ortalama 0,92 USD (medyan çağrı 10, p90 628) |

**Türetilen birim değerler (tahmin dayanağı):**

* Ürün çalışma zamanı: 44,11 USD / 80 gün ≈ 16,5 USD/ay; ≈ 27 aktif kullanıcıya bölününce **≈ 0,61 USD / aktif kullanıcı / ay** (öğrenci+öğretmen karışık). Token: ≈ 200 bin giriş + 40 bin çıkış / aktif kullanıcı / ay.
* Sabit içerik operasyonu: 19,42 USD / 80 gün ≈ **7,3 USD/ay** (tek seferlik backfill ağırlıklı; ölçekle büyümez).

**Bu ölçümlerin zayıflıkları:** (1) 25 öğrenci pilot/test kullanıcısı; gerçek kullanım dağılımı farklı olabilir. (2) Yönetici/üretici kullanımının bir kısmı "öğrenci" rolü altında görünüyor olabilir. (3) Kasım ayı düşük kullanımı (3,88 USD/24 gün) maliyetin trafiğe duyarlı olduğunu, ama aynı zamanda tek ayın sonucunu genelleştirmenin yanıltıcı olduğunu gösteriyor.

## 2. Varsayımlar (açıkça)

| # | Varsayım | Değer | Gerekçe |
|---|---|---|---|
| V1 | Aktif öğrenci başına aylık AI maliyeti, mevcut altyapı | **0,61 USD** (duyarlılık: 0,30–1,15) | Yukarıdaki ölçüm; düşük/yüksek uçlar medyan ve Ekim ortalaması |
| V2 | Aktif öğrenci başına aylık token | 200 bin giriş / 40 bin çıkış | Ölçüm |
| V3 | Sabit içerik operasyonu | 7,3 USD/ay | Ölçüm; ölçekle sabit |
| V4 | Açık model API fiyat bandı (Providers/Together/Groq) | giriş 0,15–0,40 / çıkış 0,60–1,60 USD/M token | Groq gpt-oss-120b 0,15/0,60 ([özet](https://www.morphllm.com/groq-pricing)); Together Qwen3.5 9B 0,17/0,25 ([özet](https://www.morphllm.com/together-ai-pricing)); **ikincil kaynak, doğrulanacak** |
| V5 | → Aktif öğrenci başına, **tüm trafik** açık modelde | 0,054 – 0,144 USD/ay | 0,2 M × giriş + 0,04 M × çıkış hesabı |
| V6 | GPU (self-host) birim fiyatı | L40S 1,80 USD/sa → **1.314 USD/ay/GPU** (730 sa) | [HF Endpoints fiyatı](https://huggingface.co/docs/inference-endpoints/en/pricing) (sayfa eski veri uyarısı veriyor) |
| V7 | GPU kapasitesi | **12.500 aktif öğrenci/GPU** (tepe yük dahil) — **ölçülmedi, tahmin** | Çıktı ≈ 40 bin token/öğrenci/ay, tepe/ortalama oranı 5–10× varsayımı; gerçek kapasite vLLM yük testiyle belirlenmeli |
| V8 | Minimum 2 GPU (yüksek erişilebilirlik) | zorunlu | Tek GPU = tek hata noktası |
| V9 | İzleme+bakım+nöbet | 2.300 USD/ay sabit | Yarı zamanlı mühendis + gözlem araçları; **şirket içi maliyete göre değişir** |
| V10 | Hibrit karışım | Maliyetin %45'i premium kalır; %55'i açık modele (≈ 6× ucuz) taşınır; önbellek/deterministik kazanç ≈ 0,04 USD/öğrenci/ay | **Tahmin**; ölçümle (Benchmark Planı) doğrulanana kadar sadece plan |
| V11 | Kur, vergi, kota, vergilendirme, ağ çıkış ücreti | dahil değil | — |

## 3. Senaryo tablosu (aylık USD, **tahmin**)

A = mevcut API altyapısı · B = Hugging Face Inference Providers (tüm trafik açık modelde, üst sınır senaryosu) · C = Together/Groq · D = self-host GPU (V6–V9) · E = hibrit (V10).

| Aktif öğrenci | A Mevcut | B HF Providers (aralık) | C Together/Groq (aralık) | D Self-host | E Hibrit |
|---:|---:|---:|---:|---:|---:|
| 100 | ≈ 68 | 5 – 14 | 5 – 15 | ≈ 4.930 (2 GPU) | ≈ 36 |
| 1.000 | ≈ 617 | 54 – 144 | 50 – 150 | ≈ 4.930 (2 GPU) | ≈ 297 |
| 10.000 | ≈ 6.107 | 540 – 1.440 | 500 – 1.500 | ≈ 4.930 (2 GPU) | ≈ 2.907 |
| 50.000 | ≈ 30.507 | 2.700 – 7.200 | 2.500 – 7.500 | ≈ 7.560 (4 GPU) | ≈ 14.507 |
| 100.000 | ≈ 61.007 | 5.400 – 14.400 | 5.000 – 15.000 | ≈ 12.810 (8 GPU) | ≈ 29.007 |

A: `0,61 × N + 7,3` · B/C: `N × (0,054–0,15)` · D: `max(2, ⌈N/12.500⌉) × 1.314 + 2.300` · E: `0,29 × N + 7,3`.

**Duyarlılık (A için):** V1 = 0,30 ise 10.000 öğrenci ≈ 3.000 USD; V1 = 1,15 ise ≈ 11.500 USD. Yani yukarıdaki A satırı ±%50'ye yakın belirsizdir.

### Tabloyu doğru okumak

* **B/C sütunları tavan tasarruf senaryosudur.** Kalite kapıları geçilmeden tüm trafiğin açık modele taşınması mümkün değildir; özellikle açık uçlu puanlama ve zor soru üretimi taşınmayacak olabilir. Gerçekçi hedef E (hibrit) sütunudur: **≈ %50 tasarruf tahmini**, ölçülene kadar plan değil hedef.
* D'nin 100–10.000 öğrencide A'dan **çok daha pahalı** olması, self-host'un küçük ölçekte ekonomik olmadığını gösterir.
* Maliyet kaleminin tamamı bu değil: bu tablo yalnız çıkarım. İnsan gözden geçirme, benchmark koşuları, geliştirme/bakım emeği ve ücretli endpoint'lerin boşta kalan süresi ayrıdır.

## 4. Self-host başabaş (break-even) analizi

D'nin sabit maliyeti: 2 GPU + işletme ≈ **4.930 USD/ay** (V6–V9).

| Karşılaştırılan | Başabaş (aktif öğrenci) | Hesap |
|---|---:|---|
| D vs A'nın taşınabilir kısmı (%55 × 0,61 = 0,335 USD/öğrenci) | ≈ **14.700** | 4.930 / 0,335 |
| D vs B/C üst fiyat (0,144 USD/öğrenci) | ≈ **34.200** | 4.930 / 0,144 |
| D vs B/C alt fiyat (0,054 USD/öğrenci) | ≈ **91.300** | 4.930 / 0,054 |

Yorum: Premium API'den kıyaslanınca self-host ≈ 15 bin aktif öğrenci civarında anlamlı olabilir; ama **ucuz açık-model API'lerle kıyaslanınca ancak 34–91 bin aktif öğrenci** civarında başabaşa gelir. Dolayısıyla "kendi GPU'muz" yatırımı için ilk durak Together/Groq/HF Providers; self-host yalnız şu durumlarda önerilir: (a) hacim bu başabaş aralığına yaklaşırsa, (b) veri egemenliği/KVKK nedeniyle S2 verinin Türkiye/AB'de ayrılmış donanımda işlenmesi şart olursa (bu durumda başabaş maliyet kıyası ikinci planda kalır).

Boşta kalma (idle) maliyeti: gece/hafta sonu düşük kullanım yüzünden 2 GPU'nun **kullanım oranı** düşebilir. Okul trafiği gün içinde yoğunlaşır; 730 saat/ay ödenir ama etkin kullanım belki %20–35'tir (**tahmin**). Bu yüzden endpoint'in "scale-to-zero" özelliği ve zamanlanmış küçültme değerlendirilmelidir (soğuk başlangıç gecikmesi ile birlikte).

## 5. Kısa vadeli, risksiz tasarruf kalemleri (model değişimi gerektirmeyen)

Bu kalemler Hugging Face'ten bağımsız olup **hemen** uygulanabilir; ölçülmüş verilere dayanır:

| Kalem | Dayanak | Tahmini etki |
|---|---|---|
| Claude Sonnet 4.5 → 5.5 geçişi **tamamlanmış** (4.5 son kullanım 9 Eki; 30 Kas'ta kapanıyor) — geçmiş kayıtlardaki fark tasarruf nedeni | 2.026 çağrı sonnet-4-5 = 28,67 USD; sonnet-5-5 fiyatı `ai-pricing.ts`'e göre 2/10 USD (4.5: 3/15) | Birim fiyat %33 düşük; ancak `lib/claude-models.ts` Sonnet 5.5'in aynı metin için ≈ %30 daha fazla token ürettiğini söylüyor → net tasarruf ≈ %13 (**tahmin**, ölçülmeli) |
| Anthropic `cache_control`'ün `generate-quiz` dışındaki statik istemlere yayılması | Yalnız `generate-quiz`'de var; OpenAI otomatik cache 6,26 M token tasarruf etmiş | Statik istem payına bağlı; **tahmin ≤ %10–20** (ölçülmeli) |
| Gemini hata zincirinde devre kesici | `outcome` kaydı olan 137 Gemini çağrısının hepsi `provider_error` | Boşa harcanan çağrı tasarrufu (tutarı küçük, ama gecikmeyi kısaltır) |
| `question_bank` yeniden kullanımı (5.774 kayıt) | Üretim yerine bankadan sunma | Üretimin bir bölümü sıfır maliyet |
| Toplu backfill'in toplu/batch API'ye veya açık modele taşınması | ≈ 12,2 USD tek seferlik; ancak yeni kazanım/sınıf eklendikçe tekrarlanır | Tekrarda ≈ %50+ (batch indirimleri sağlayıcı bazlı doğrulanmalı) |

## 6. Sonuç

1. Bugünkü maliyet küçük (≈ 16–32 USD/ay) ve pilot ölçekte AI maliyeti kritik risk değil. **Maliyet motivasyonu ölçekte** (10.000+ aktif öğrenci ≈ 6.000 USD/ay A senaryosu) belirginleşiyor.
2. Maliyet düşürmenin en güvenli yolu hibrit: deterministik/embedding kademeleri + önbellek + toplu işlerin açık modele taşınması; öğrenciye dönük kritik pedagojik işlerde Claude/OpenAI kalır.
3. Self-host, 35.000+ aktif öğrenciden önce veya veri egemenliği zorunluluğu olmadan önerilmez.
4. Bu tablo, `ai_usage_logs`'a `outcome`/`duration_ms` yazımı tamamlanıp **gerçek kullanım** verisi birikince (özellikle okul açıkken) yeniden hesaplanmalıdır.
