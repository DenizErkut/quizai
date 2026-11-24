# PRATIUM — AI Altyapısı Mevcut Durum Analizi (Aşama 1)

Tarih: 24 Kasım 2026 · Kapsam: salt-okunur analiz. Üretimde hiçbir kod, ayar veya veri değiştirilmedi.

**Veri kaynakları.** (1) Kod tabanı (dosya/fonksiyon referansları aşağıda). (2) Üretim `ai_usage_logs` tablosu — 5 Eylül → 24 Kasım 2026, 12.042 çağrı, 63,54 USD, 28 farklı kullanıcı. Bu rakamlar **ölçülmüş** değerlerdir. (3) Çıkarım gereken her yerde "tahmin" diye işaretlenmiştir.

**Ölçeğe dair uyarı.** Üretimde 113 profil var; 60 günde AI çağrısı yapan 26 kullanıcı (medyan 10 çağrı, p90 628 çağrı). Yani veriler pilot ölçeğindedir ve test/yönetici kullanımıyla çarpıktır; büyük ölçek tahminleri bu yüzden belirsizdir (bkz. `HUGGINGFACE_COST_ANALYSIS.md`).

---

## 1. Kullanılan sağlayıcılar ve modeller (ölçülmüş)

| Sağlayıcı | Model | Çağrı | Maliyet (USD) | Ort. giriş / çıkış token | Ort. süre | p95 süre |
|---|---|---:|---:|---|---:|---:|
| Anthropic | claude-sonnet-4-5 (eski, 30 Kas'ta kapanıyor) | 2.026 | 28,67 | 2.201 / 419 | 8,5 sn | 20,9 sn |
| Anthropic | claude-sonnet-5-5 | 601 | 11,08 | 4.586 / 926 | 2,7 sn* | 2,8 sn* |
| Anthropic | claude-haiku-4-5 | 476 | 8,30 | 9.052 / 1.420 | 10,3 sn | 24,6 sn |
| OpenAI | gpt-4.1-mini | 3.776 | 5,76 | 1.645 / 439 | 3,9 sn | 9,9 sn |
| Google | gemini-3.6-flash | 1.543 | 5,35 | 3.822 / 160 | kayıt yok | kayıt yok |
| Mistral | mistral-small-latest | 2.557 | 1,92 | 5.586 / 703 | 5,3 sn | 12,0 sn |
| Mistral | mistral-large-latest | 440 | 1,63 | 4.698 / 897 | 13,1 sn | 35,0 sn |
| OpenAI | gpt-4o | 609 | 0,82 | 446 / 14 | 1,0 sn | 2,0 sn |
| OpenAI | gpt-4o-mini | 12 | 0,02 | 5.492 / 1.472 | 13,0 sn | 21,8 sn |

\* sonnet-5-5 süre kayıtları yalnızca az sayıda satırda dolu; güvenilir değil.

Anthropic toplamı **48,05 USD = %75,6**. Aylık seyir: Eylül 32,16 USD (14 kullanıcı) → Ekim 27,49 USD (24 kullanıcı) → Kasım (24 gün) 3,88 USD (16 kullanıcı).

Kullanıcı rolüne göre: öğrenci 36,00 USD (25 öğrenci), kullanıcısız/sistem 23,88 USD, öğretmen 3,65 USD. İşlev grubuna göre: ürün çalışma zamanı 44,11 USD (14,9 M giriş / 2,9 M çıkış token), içerik operasyonu (toplu/yönetici) 19,42 USD (25,4 M giriş / 3,4 M çıkış token).

Kodda tanımlı, üretim kaydında görülmeyen çağrılar: `tts-1` (`app/api/reading/tts/route.ts:34`), `gpt-4o-mini-tts` (`app/api/coach/speech/route.ts:59`), Gemini `text-embedding-004` (`app/api/meb-search/route.ts:28`, `app/api/admin/exam-upload/route.ts:95`) ve Gemini ses/görüntü (`app/api/extract-file/route.ts:40,249`).

## 2. AI çağrı noktaları, amaçları ve maliyet payı

| Operasyon (log adı) | Dosya · fonksiyon | Amaç | Ölçülen maliyet | Not |
|---|---|---|---:|---|
| `generate-quiz` | `app/api/generate-quiz/route.ts` (~1256, 2179–2225, 2438, 2643) | Soru üretimi (gövde GPT-4.1-mini; zor için Claude; Mistral payı) | ≈ 32,9 USD (%52) | En büyük kalem; Claude hâlâ en pahalı kısmı |
| `historical-objective-backfill-v1` | `app/api/admin/objective-mapping-review/backfill/route.ts:156-170` | Eski sorulara MEB kazanımı eşleme (Haiku + Gemini + GPT + Mistral) | ≈ 12,2 USD (%19) | Toplu iş; gerçek zamanlı değil → açık model/batch adayı |
| `verify-questions` | `app/api/verify-questions/route.ts:104,341–412,500` | Soru doğrulama (GPT-4.1-mini, Gemini, Mistral Small, Claude yedek, gpt-4o) | ≈ 5,0 USD (%8) | Kısa istem (≈510 giriş/103 çıkış); ≈4.000 çağrı |
| `written-exam-parse` | `app/api/admin/written-exam/parse/route.ts:106` | Yazılı PDF'ini yapılandırma | 2,11 USD | Yönetici, seyrek |
| `coach-*` | `lib/coach-generation.ts:140-163` | Öğrenci koç mesajları | ≈ 2,6 USD | Öğrenci verisi içerir |
| `visual-question`, `question-bank`, `ai-booklet-validator` | `lib/gemini-visual-quality.ts`, `lib/question-bank.ts`, `generate-quiz/route.ts:498-657` | Görsel soru doğrulama/üretim, banka kalite kontrolü | ≈ 3 USD | GPT/Gemini/Mistral karışık |
| `grade-open-ended` | `lib/open-ended-grading.ts:89` | Açık uçlu cevap puanlama | ≈ 0,85 USD | Pedagojik açıdan kritik, Claude |
| `misconception-clusters` | `lib/misconception-cluster-run.ts:36` | Yanılgı kümeleme (LLM ile) | ≈ 1,0 USD | Embedding + kümeleme adayı |
| `tutor-response` / `bot` | `app/api/chat/route.ts:147`, `app/api/bot/route.ts:59` | Öğrenci AI koçu/sohbet | küçük | Güvenlik katmanı var (`tutor-safety-v3`) |
| `ai-analysis`, `study-plan-generator`, `teacher:analyze` | `app/api/ai-analysis/route.ts:33`, `lib/study-plan-generator.ts:205`, `app/api/teacher/analyze/route.ts:189` | Öğrenci analiz/çalışma planı | küçük | **Öğrenci adı istemde** (bkz. §6) |
| `import-*`, `open-ended-paper`, `written-paper-transcribe` | `app/api/teacher/import-*`, `app/api/open-ended/paper`, `app/api/student/written-exams/paper` | Kâğıt/fotoğraf okuma (OCR + yapılandırma) | küçük | Görsel; Claude Sonnet |
| Gemini Vision | `lib/pdf-extract.ts:37`, `app/api/extract-file/route.ts:40`, `app/api/reading/upload/route.ts:56` | Taranmış PDF/ses okuma | ≈ 5,35 USD (Gemini toplamı) | OCR/STT adayı |

## 3. Mevcut router ve yönlendirme mekanizmaları (yeniden yapılmayacak, bunlar mevcut)

Dizin: `lib/ai-gateway/`.

* `contracts.ts` — `AIProvider` (`deterministic | approved_content | mistral | openai | anthropic | google`), `IntelligenceTask`, **`IntelligenceLevel = 'L0'…'L5'`**, `IntelligenceRoutePlan`, `AIProviderAdapter`. Yani L0–L5 kademe fikri zaten kodda var.
* `model-registry.ts` — 6 kayıtlı model; model adları ortam değişkeniyle ayarlanır (`MISTRAL_PRIMARY_MODEL`, `OPENAI_VALIDATOR_MODEL`, `ANTHROPIC_PREMIUM_MODEL`, `GEMINI_MULTIMODAL_MODEL`).
* `router.ts` — `buildIntelligenceRoutePlan()`: yalnızca *karar üretir*; görsel→Gemini, doğrulama→OpenAI, premium→Claude. Yalnızca iki yönetici rotasında çağrılıyor (`app/api/admin/misconception-micro-content/route.ts:48`, `app/api/admin/learning-graph-suggest/route.ts:123`).
* `quiz-provider-router.ts` — `pickQuizEngine()` + `generateWithRoutedProvider()`: hash tabanlı kova (`GPT_PILOT_FRACTION`, `MISTRAL_LIVE_FRACTION`), zor soru → Claude, yönetici `forceProvider`. Beş rotada kullanılıyor (`generate-open-ended`, `live-quiz`, `generate-exam`, `teacher/create-open-ended`, `education-eval/run`).
* `measured-quiz-router.ts` — `pickMeasuredQuizEngine()`: son 30 gün `ai_usage_logs` ölçümlerine göre sağlıklı/başarısız/pahalı kararı; **varsayılan `shadow` modu** (`MEASURED_ROUTER_MODE=active` olmadıkça canlı sağlayıcıyı değiştirmez). Eşikler: başarı < %70, p95 > 90 sn, maliyet > en ucuzun 2,5 katı.
* `quality-engine.ts` — `evaluateQuestionStructure()` (Tier 0 deterministik yapı kontrolü), `decideQuestionQuality()` (çok sinyalli accept/reject).
* `shadow-comparison.ts` + `adapters/mistral.ts` — Mistral gölge çıkarımı; metrikler `ai_shadow_evaluations` tablosuna (ham içerik saklanmaz). **Tabloda bugün 0 satır var** (gölge örneklem fiilen çalışmamış).
* `lib/quiz-provider-policy.ts` — ölçümlü oran politikası (GPT %90 / Claude kontrol %10 varsayılan).
* `lib/ai-usage.ts`, `lib/ai-pricing.ts` — merkezi kullanım/maliyet günlüğü; dönemsel fiyat (`PERIOD_PRICES`) desteği.
* `lib/ai-cost-alert.ts` — günlük 5 USD, 3× sıçrama, kullanıcı başına 400 çağrı alarmı.

Görülen eksikler: yalnızca Mistral `AIProviderAdapter` arayüzünü uyguluyor; OpenAI (`lib/openai.ts` `callOpenAI`), Anthropic (ham SDK, ≈ 35 dosyada doğrudan) ve Gemini (ad-hoc `fetch`) ortak arayüzün dışında. Detay: `HUGGINGFACE_ARCHITECTURE.md`.

## 4. Tekrarlanan / gereksiz çağrılar ve önbellek

* **Çoklu doğrulayıcı zinciri** (`verify-questions`): aynı soru için sırayla GPT-4.1-mini → Gemini → Mistral Small → Claude/gpt-4o; ≈ 4.050 çağrı, ≈ 5 USD. Tasarım gereği kalite çapraz kontrolü; ancak ucuz sınıflayıcı + yalnızca belirsiz durumda LLM ile maliyet düşürülebilir.
* **Gemini sağlayıcı hataları:** son 60 günde `outcome` kaydı olan 137 Gemini çağrısının tamamı `provider_error` (toplam 684 Gemini çağrısı içinde). Devre kesici/yeniden deneme yok; hata zinciri her seferinde ücretli çağrı tüketiyor olabilir.
* **Tekrar deneme yok:** Anthropic çağrıları `maxRetries: 0` (`quiz-provider-router.ts`), `callOpenAI` yalnızca zaman aşımı içerir (`lib/openai.ts`).
* **Önbellek:**
  * Anthropic `cache_control` yalnızca `generate-quiz` içinde (statik sistem bloğu); log: 518.780 + 863.944 cache-read token. Diğer ≈ 30 Anthropic çağrı noktasında yok.
  * OpenAI otomatik istem önbelleği çalışıyor: **6.256.512** cache-read token (ölçülmüş).
  * Mistral cache-read ≈ 119 bin token.
  * Yanıt (sonuç) önbelleği: `teacher/analyze` içinde analiz önbelleği var; `topic-summary`, `ai-analysis`, `study-plan-generator`, `teacher-class-insight` için yok.
  * `question_bank` 5.774 kayıt (son 30 günde +208) → üretim yerine yeniden kullanım potansiyeli var (`lib/question-bank.ts`).

## 5. Deterministik algoritmaya / açık modele uygun işlemler

| İşlem | Bugün | Öneri kademe | Gerekçe |
|---|---|---|---|
| Sayısal/tam eşleşme cevap kontrolü | `check-answer` zaten AI'yi atlıyor (sayı ve tam eşleşme) | **Tier 0 genişletme**: Türkçe normalizasyon, birim temizleme, kesir/ondalık denkliği | Sadece sınır durumda LLM |
| Matematik doğrulama (`verify-math`, `lib/openai.ts:105`) | gpt-4o-mini | Tier 0: CAS/ifade değerlendirme (sympy-benzeri) | Doğru/yanlış kesin ölçülür |
| Yapısal soru doğrulama | `quality-engine.ts` (var) | Tier 0 (mevcut) | — |
| Yinelenen/benzer soru | metin normalizasyonu | Tier 0 (MinHash) + Tier 1 (embedding) | Embedding altyapısı şu an fiilen **kapalı** |
| MEB kazanım eşleme | LLM (≈ 12 USD toplu) | Tier 1 (embedding + yeniden sıralama) + onaylı eşleşme önbelleği; belirsizlerde Tier 2 | Toplu iş, doğrulanabilir |
| Zorluk sınıflandırma | LLM + `question_difficulty_measurements` | Tier 1 (klasik ML; cevap istatistikleri) | Etiketli veri tabanda var |
| Yanılgı kümeleme | Sonnet 5.5 (`misconception-cluster-run.ts`) | Tier 1 (embedding + kümeleme) + Tier 2 etiketleme | — |
| Anlamsal arama | **kapalı**: `exam_chunks` 0/2.686, `meb_chunks` 0/86 embedding'li; `meb-upload` "embedding devre dışı" | Tier 1 (açık embedding modeli) | Şu an yalnız anahtar kelime arama |
| PDF/görsel OCR | Gemini Vision | Tier 5 (PaddleOCR-VL / VLM) — önce ölçüm | — |
| Toplu içerik işleri (backfill, parse) | pahalı modeller | Tier 2–3 açık model + batch | Gecikme önemsiz |

Pedagojik açıdan kritik ve **olduğu gibi kalacaklar:** açık uçlu puanlama (`open-ended-grading.ts`), zor soru üretimi, öğrenci koçu güvenlik katmanı.

## 6. Veri güvenliği bulgusu (acil)

Öğrencinin **tam adı** üç yerde doğrudan LLM istemine yazılıyor:

* `app/api/ai-analysis/route.ts:28-37` — `identity?.full_name` → "…${displayName} adlı … öğrencisi için".
* `lib/study-plan-generator.ts:209` — `opts.displayName`.
* `app/api/teacher/analyze/route.ts:143` — "Ad: ${studentIdentity?.full_name}".

Bu, projenin "kimlik verisi yalnızca TR-PG'de kalır" ilkesiyle ve veri minimizasyonuyla çelişir (bkz. `docs/KVKK-VERI-ENVANTERI-21-EKIM-2026.md`). Adın sağlayıcıya gitmesi için hiçbir işlevsel gereklilik yoktur ("Öğrenci" yeterli). **Düzeltme önerisi P0** (`HUGGINGFACE_IMPLEMENTATION_PLAN.md`); onayınız olmadan kod değiştirilmedi.

## 7. Fallback ve yönlendirme özeti

* Quiz üretimi: seçilen motor hata verirse Claude'a düşme (ör. `generate-open-ended/route.ts:234`, `live-quiz/route.ts:92`).
* `pickMeasuredQuizEngine` sağlık kapıları — shadow modunda yalnızca öneri.
* Kayıp: sağlayıcı genelinde circuit breaker, yeniden deneme/backoff, sağlayıcı bazlı oran sınırı ve çok sağlayıcılı ortak yapılandırılmış çıktı doğrulaması yok.
* Kullanıcı bazlı oran sınırı: `checkRateLimit` 45 rotada kullanılıyor (`lib/rate-limit.ts`).

## 8. Telemetri boşlukları (benchmark'ı engelleyen)

* `ai_usage_logs.meta.outcome` yalnızca ≈ 150 OpenAI/Mistral/Gemini satırında dolu; Anthropic'in büyük kısmında yok → başarı/başarısızlık oranı ölçülemiyor.
* `duration_ms` Anthropic'in birçok operasyonunda boş (`avg_ms = null`).
* `ai_shadow_evaluations` boş.

Bu üç boşluk P0/P1 olarak planda yer alır; kapatılmadan modeller arası adil karşılaştırma yapılamaz.
