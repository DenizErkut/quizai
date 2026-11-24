# PRATIUM — Hugging Face Uygulama Planı (Aşama 8)

Tarih: 24 Kasım 2026. **Bu plan onay bekler. Aşağıdaki işlerden hiçbiri başlatılmadı.** Mevcut OpenAI/Claude/Gemini/Mistral entegrasyonları kaldırılmaz; yeni katman bayrakla (varsayılan kapalı) devreye girer. İlk aşamada üretim AI servisleri değişmez; açık modeller paralel/çevrimdışı ortamda değerlendirilir.

Öncelik: **P0** = hemen/güvenlik-telemetri temeli · **P1** = ilk değer, düşük risk · **P2** = kontrollü canlıya geçiş · **P3** = ölçek/uzun vade.
Efor: S ≈ ≤ 1 gün · M ≈ 2–5 gün · L ≈ 1–3 hafta (tek geliştirici tahmini).

## Onay kapıları (zorunlu — her biri açık, yazılı onay ister)

| Kapı | Onay gerektiren işlem |
|---|---|
| G1 | Üretim kodunda davranış değişimi (P0 maddeleri dahil) |
| G2 | Veritabanı migration'ı (yeni tablo/sütun, pgvector indeksleri) |
| G3 | Yeni sağlayıcı anahtarı/hesabı, **ücretli** API kullanımı (bütçe tavanı ile) |
| G4 | Ücretli Inference Endpoint / GPU oluşturma |
| G5 | Herhangi bir canlı kullanıcı trafiğinin açık modele yönlendirilmesi (kanarya dahil) |
| G6 | Lisans hukuk onayı (Llama/Gemma 3 gibi özel lisanslar için zorunlu) |
| G7 | Fine-tuning/model eğitimi — **bu planın kapsamı dışı; ilk aşamada başlatılmaz** |

## P0 — Güvenlik ve ölçüm temeli

### P0-1 · Öğrenci adlarını LLM istemlerinden çıkar + PII geçidi
* **Öncelik:** P0 · **İş değeri:** KVKK/veri minimizasyonu; kimlik verisinin dış sağlayıcıya gitmesini bitirir (`HUGGINGFACE_SECURITY.md` S-1).
* **Efor:** S–M · **Bağımlılık:** yok (G1).
* **İş:** `app/api/ai-analysis/route.ts:28-37`, `lib/study-plan-generator.ts:209`, `app/api/teacher/analyze/route.ts:143` içinde ad yerine "Öğrenci"; `lib/ai-gateway/pii-guard.ts` (e-posta/telefon/T.C. kimlik no kalıp maskeleme) + birim testler; çağrı sitelerine kademeli uygulama.
* **Risk:** Çıktının kişiselleştirilmiş selamlaması kaybolur (öğretmen görünümünde ad ayrıca arayüzde gösterilebilir); regex yanlış-pozitifleri.
* **Kabul ölçütleri:** (1) Kodda `full_name`/`displayName` hiçbir sağlayıcı isteğine girmez (test + grep kapısı); (2) PII maskeleme testleri geçer; (3) mevcut e2e/unit testleri yeşil.
* **Geri alma:** tek commit geri alınır (bayraksız küçük değişiklik) veya `AI_PII_GUARD=off`.

### P0-2 · Telemetri boşluklarını kapat (`outcome`, `duration_ms`, kalite)
* **Öncelik:** P0 · **İş değeri:** Benchmark ve ölçümlü router'ın kanıt toplayabilmesi için önkoşul (bugün çoğu satırda `meta.outcome` ve Anthropic'te `duration_ms` yok).
* **Efor:** M · **Bağımlılık:** G1.
* **İş:** `logAnthropicUsage`/`logGeminiUsage`/`callOpenAI` yardımcılarında süre ve sonucu (`success|error|timeout|invalid_output`) zorunlu yaz; `ai-pricing.ts` eksik fiyat uyarıları; ham içerik yok.
* **Risk:** Çok dosyaya dokunur (≈ 35 çağrı noktası) — yardımcı fonksiyon seviyesinde yapılırsa risk düşük.
* **Kabul:** 7 gün içinde yeni satırların ≥ %99'unda `duration_ms` ve `meta.outcome` dolu; tüketilen maliyet toplamı değişmez.
* **Geri alma:** commit revert; yalnız günlük alanı olduğundan kullanıcıyı etkilemez.

### P0-3 · Sonnet 4.5 kapanış denetimi (30 Kasım) — **doğrulandı, işlem gerekmiyor**
* **Durum:** `ai_usage_logs`'ta `claude-sonnet-4-5*` son kullanım 9 Ekim 2026; son 14 günde 0 satır. Kodda (fiyat tablosu dışında) 4.5 modeli geçmiyor. Fiyat kaydı geçmiş satırlar için kalmalı.
* **Geri alma / acil durum:** `ANTHROPIC_PREMIUM_MODEL` ortam değişkeni.

## P1 — Düşük riskli ilk değer (çevrimdışı/gölge)

### P1-1 · Benchmark çalıştırıcısı ve altın veri setleri
* **Değer:** Her sonraki karar bu ölçüme dayanır (`HUGGINGFACE_BENCHMARK_PLAN.md`). **Efor:** L · **Bağımlılık:** P0-2, G3 (ücretli çağrı tavanı).
* **Risk:** Altın veri hazırlama emeği; öğretmen puanlaması gerekir. **Kabul:** 13 kategorinin en az 8'i için ≥ 150 örnekli anonim set; tek komutla tekrarlanabilir rapor.
* **Geri alma:** Yalnız `scripts/` ve rapor dosyaları eklenir; silinir.

### P1-2 · Model Doğrulama Kartları (lisans/köken/sürüm)
* **Değer:** Hukuki güvenlik; ◻ işaretli tüm model bilgilerini kapatır. **Efor:** S–M · **Bağımlılık:** HF'ye erişimi olan ortam (bu çalışma ortamı `huggingface.co`'ya erişemedi).
* **Kabul:** Her aday için `docs/ai/models/<ad>.md`: revision SHA, LICENSE kopyası, safetensors varlığı, bağlam penceresi, desteklenen diller, hukuk durumu. **Geri alma:** n/a (belge).

### P1-3 · Embedding çevrimdışı değerlendirmesi (bge-m3 / e5 / Qwen3-Embedding)
* **Değer:** Anlamsal arama bugün **kapalı** (0/2.686 + 0/86 embedding); kazanım eşleme (toplu ≈ 12 USD), yinelenen soru, yanılgı kümeleme için en büyük risk-getiri oranı. **Efor:** M · **Bağımlılık:** P1-1 veri setleri, P1-2; embedding hesabı için CPU/küçük GPU ya da HF Providers (G3).
* **Risk:** Türkçe başarımı ölçülmeden belirsiz; vektör boyutu/depolama. **Kabul:** kazanım Top-3 doğruluğu ve benzer-soru F1, mevcut LLM eşlemesine göre aşağı-olmama sınırında; yalnız çevrimdışı rapor — üretim değişmez.
* **Geri alma:** Çevrimdışı olduğundan gerekmez.

### P1-4 · Tier 0 genişletmeleri (deterministik)
* **Değer:** Sıfır model maliyeti, sıfır gecikme. **Efor:** M · **Bağımlılık:** G1.
* **İş:** `check-answer` normalizasyonu (Türkçe ondalık, birim, kesir denkliği); `verify-math` yerine ifade değerlendirme/CAS; MinHash ile tekrar soru; doğrulama sonuçlarının onaylı içerik önbelleği.
* **Risk:** Yanlış "doğru/yanlış" kararı; kısmi kapsama. **Kabul:** Mevcut doğrulayıcı kararlarıyla uyum ≥ %99 (7 gün gölge); belirsiz durumda yine LLM'e düşer.
* **Geri alma:** `AI_TIER0_EXT=off`.

### P1-5 · OpenAI-uyumlu adapter (karanlık/bayraklı) + `AIProvider` genişletme
* **Değer:** HF Providers/Together/Groq/vLLM/Ollama için tek giriş; sağlayıcı bağımlılığını azaltır. **Efor:** M · **Bağımlılık:** G1; anahtar için G3.
* **Kabul:** Adapter birim testleri (sahte sunucuyla); hiçbir üretim rotası çağırmaz; `isConfigured()` anahtar yokken false. **Geri alma:** kullanılmayan dosya, bayrak kapalı.

### P1-6 · Dayanıklılık: yeniden deneme, devre kesici, sağlayıcı oran sınırı
* **Değer:** Gemini'nin `provider_error` örüntüsü gibi boşa çağrıları keser; yedeklemeyi güvenilir kılar. **Efor:** M · **Bağımlılık:** P0-2.
* **Risk:** Hatalı kesici açık kalırsa sağlayıcıyı gereksiz dışlar. **Kabul:** Simüle hata testlerinde kesici açılır/kapanır; günlükte karar kodları; yanlış açılma 7 günde 0.
* **Geri alma:** `AI_CIRCUIT_BREAKER=off`.

### P1-7 · Sağlayıcı veri politikası kayıt defteri + hukuk teyidi
* **Değer:** KVKK m.9 yükümlülükleri; S2 veri için hangi sağlayıcının kullanılabileceğini netleştirir. **Efor:** M (hukuk süresi hariç) · **Bağımlılık:** G6.
* **Kabul:** Her aktif sağlayıcı için retention/eğitim/bölge/DPA satırı doldurulmuş, hukuk onaylı. **Geri alma:** n/a.

## P2 — Kontrollü geçiş

### P2-1 · Gölge çıkarım (Tier 2 görevler)
* **Değer:** Gerçek görevde açık modelin kalitesini kullanıcıyı etkilemeden ölçer. **Efor:** M–L · **Bağımlılık:** P0-2, P1-1, P1-5, **G2** (görev-bağımsız `ai_task_shadow_runs` tablosu), G3.
* **Kapsam (önerilen sıra):** (1) `verify-questions` ikincil doğrulayıcı, (2) `historical-objective-backfill` toplu işi, (3) soru kalite hakemi. **Yalnız S0/S1 verisi.**
* **Kabul:** ≥ 500 gölge örnek/görev; metrikler tabloda; ham içerik yok. **Geri alma:** `AI_SHADOW_TASKS=` boş bırak.

### P2-2 · Toplu işlerin açık modele taşınması (kanarya yok, yönetici işleri)
* **Değer:** Backfill gibi ≈ 12 USD'lik (tekrarlanabilir) toplu işlerin maliyeti; kullanıcıya dokunmaz. **Efor:** M · **Bağımlılık:** P2-1 kabulü, **G5**.
* **Kabul:** Çıktı onaylı etiketlerle uyum eşiği geçmiş; insan gözden geçirme örneklemi. **Geri alma:** rota bayrağı → eski sağlayıcılar.

### P2-3 · Önbellek genişletme (Anthropic `cache_control`, sonuç önbelleği)
* **Değer:** Doğrulanmış model değişikliği gerektirmeden maliyet. **Efor:** S–M · **Bağımlılık:** G1.
* **Risk:** Yanlış anahtar → yanlış kişiye yanıt (tenant kapsamı zorunlu, bkz. Güvenlik). **Kabul:** önbellek isabet oranı ölçülür; tenant testleri. **Geri alma:** `AI_RESULT_CACHE=off`.

### P2-4 · Yönlendirme politikasının yapılandırmaya taşınması
* **Değer:** Model seçimi kod yerine yapılandırmayla yönetilir (`routing-policy`). **Efor:** M · **Bağımlılık:** P1-5, P0-2. **Kabul:** Bayrak kapalıyken yönlendirme kararları bugünkü `buildIntelligenceRoutePlan`/`pickQuizEngine` çıktılarıyla **birebir aynı** (snapshot testi). **Geri alma:** `AI_GATEWAY_V4=off`.

### P2-5 · Embedding'li özelliklerin canlıya alınması (anlamsal arama, benzer soru, kazanım ön eşleme)
* **Değer:** Kapalı olan anlamsal aramayı açar, LLM kazanım çağrılarını azaltır. **Efor:** L · **Bağımlılık:** P1-3 kabulü, **G2** (`vector` sütunları/indeks), G3/G4.
* **Kabul:** Geri çağırma/precision eşikleri benchmark planındaki kapıları geçer; geri doldurma işi (backfill) idempotent. **Geri alma:** özellik bayrağı kapat; eski anahtar kelime arama çalışmaya devam eder.

### P2-6 · Kanarya (%1 → %5 → %25) ve A/B
* **Değer:** Kanıtlanmış görevlerde kontrollü canlıya geçiş. **Efor:** M · **Bağımlılık:** P2-1/P2-2 kabulü, tüm kalite kapıları, **G5**.
* **Kabul:** Her adımda kalite/gecikme/hata/maliyet panosu eşikte; otomatik geri düşüş: kalite kapısı veya hata oranı > %1 → ana model. **Geri alma:** kanarya oranı 0 (ortam değişkeni; kod dağıtımı gerekmez).

## P3 — Ölçek ve uzun vade

| Madde | Değer | Efor | Bağımlılık / koşul | Not |
|---|---|---|---|---|
| P3-1 Ayrılmış Inference Endpoint (S2 veri için) | Veri egemenliği | M | G4, G6 | Yalnız S2 işleri gerçekten gerekirse |
| P3-2 Self-host GPU (vLLM) | 35 bin+ aktif öğrenci veya zorunlu egemenlik | L | G4; ölçülmüş kapasite testi | Başabaş: bkz. Maliyet Analizi |
| P3-3 STT: Whisper large-v3-turbo değerlendirmesi | Gemini ses yerine | M | P1-1; ince ayar lisansları tek tek | Düşük hacim |
| P3-4 OCR: PaddleOCR-VL / olmOCR / Qwen3-VL | El yazısı/kâğıt aktarımı maliyeti | L | P1-1; lisans ◻ | Mevcut kalite referansı: Sonnet/Gemini |
| P3-5 TTS: Piper/okur-tts | OpenAI TTS yerine | M | Lisans doğrulama; ses kalitesi dinleme testi | Düşük öncelik |
| P3-6 Fine-tuning | — | — | **G7: başlatılmaz** | Yalnızca yeterli onaylı veri + benchmark boşluğu kanıtlanırsa ayrıca teklif |

## Önerilen sıra

1. **Hafta 0–1:** P0-1, P0-2, P0-3 (güvenlik + ölçüm).
2. **Hafta 1–3:** P1-2, P1-1, P1-4, P1-5, P1-7 (paralel; üretim etkisi yok).
3. **Hafta 3–5:** P1-3, P1-6; sonra G2/G3 onayıyla P2-1 gölge.
4. **Hafta 6+:** P2 kalemleri yalnız kalite kapılarını geçtikçe; P3 koşullu.

## Bu planın yapmadıkları

Mevcut sağlayıcıları kaldırmaz · yeni mikroservis/ikinci router kurmaz · onaysız ücretli endpoint/GPU açmaz · fine-tuning yapmaz · ölçülmemiş modeli üretime almaz · öğrenci verisini doğrulanmamış sağlayıcıya göndermez.

## Bağlantılı belgeler

`HUGGINGFACE_CURRENT_STATE.md` · `HUGGINGFACE_MODEL_COMPARISON.md` · `HUGGINGFACE_ARCHITECTURE.md` · `HUGGINGFACE_BENCHMARK_PLAN.md` · `HUGGINGFACE_COST_ANALYSIS.md` · `HUGGINGFACE_SECURITY.md` · mevcut `docs/MULTI_AI_GATEWAY_V3_IMPLEMENTATION.md`.
