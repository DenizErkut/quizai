# PRATIUM — Hugging Face Entegrasyon Mimarisi (Aşama 3 + 4)

Tarih: 24 Kasım 2026. **Tasarım önerisidir; hiçbir şey uygulanmadı.** İlke: yeni bir router veya mikroservis yazılmaz; mevcut `lib/ai-gateway/` genişletilir. Mevcut OpenAI, Claude, Gemini ve Mistral entegrasyonları kalır.

## 1. Mevcut router bu gereksinimleri karşılıyor mu?

Tier eşlemesi: istenen Tier 0–5 ≙ kodda zaten var olan `IntelligenceLevel` L0–L5 (`lib/ai-gateway/contracts.ts`).

| İstenen kademe | Kodda karşılığı | Durum |
|---|---|---|
| Tier 0 — deterministik kurallar | `deterministic` sağlayıcısı (`model-registry.ts`), `quality-engine.ts` `evaluateQuestionStructure`, `check-answer` sayısal/tam eşleşme atlaması | **Var** (dağınık; merkezî görev→kural tablosu yok) |
| Tier 1 — embedding / klasik ML | `approved_content` (L1) kaydı var; ancak embedding adapter'ı, vektör deposu kullanımı, klasik ML yok. `exam_chunks`/`meb_chunks` embedding'leri 0 | **Eksik** |
| Tier 2 — küçük dil modeli | Kayıt yok. Fiilen GPT-4.1-mini / Mistral Small / Haiku bu rolü oynuyor ama kademe etiketi taşımıyor (registry'de `mistralPrimary` L3, `openaiValidator` L4) | **Kısmen** (etiketleme eksik) |
| Tier 3 — genel amaçlı model | `mistralPrimary` (L3) | Var |
| Tier 4 — öncü muhakeme | `openaiValidator` L4, `geminiMultimodal` L4 | Var |
| Tier 5 — çok modlu/uzman | `claudePremium` L5; görseller `geminiMultimodal` | Var, ama kademe-yetenek ayrımı bulanık (L5 çok modlu değil, premium muhakeme) |

Parametre bazlı seçim:

| Parametre | Bugün | Boşluk |
|---|---|---|
| Görev karmaşıklığı | `IntelligenceTask` listesi; `hardDifficulty` | Görev→minimum kademe tablosu yok |
| Dil | `context.language` alanı var, router kullanmıyor | Kullanılmıyor |
| Gerekli doğruluk / pedagojik önem | `requiresPremiumReasoning` bayrağı | Sürekli değer yok |
| Gecikme | `measured-quiz-router` p95 > 90 sn kapısı | Yalnız quiz üretimi |
| Maliyet | `measured-quiz-router` maliyet kapısı, `ai-cost-alert` | Yalnız quiz üretimi |
| Öğrenci verisi hassasiyeti | `containsSensitiveStudentData` alanı var | **Router okumuyor** |
| Model erişilebilirliği | `isProviderConfigured()` (ortam anahtarı var mı) | Çalışma zamanı sağlık yok |
| Kalite güveni | `quality-engine.ts` çok sinyalli karar | Yalnız soru yapısı/doğrulayıcı |
| Geçmiş performans | `pickMeasuredQuizEngine` 30 gün `ai_usage_logs` | Yalnız 5 quiz rotası; yalnız 3 sağlayıcı |

Sonuç: omurga (kademe, kayıt, ölçümlü router, gölge tablosu, kalite motoru, maliyet günlüğü) **mevcut ve yeniden yazılmamalı**. Yapılacak iş *genişletme*.

## 2. Önerilen eklentiler (en küçük değişiklik)

1. **Tek bir OpenAI-uyumlu adapter** (`lib/ai-gateway/adapters/openai-compatible.ts`). HF Inference Providers, Together, Groq, vLLM ve Ollama aynı Chat Completions sözleşmesini sunduğu için tek sınıf, yapılandırmadan (taban URL, anahtar adı, model adı) beslenir. Mistral adapter'ı örnek alınır (`adapters/mistral.ts`). *Taban URL'lerin güncel doğruluğu uygulama sırasında her sağlayıcı belgesinden teyit edilmelidir.*
2. **`AIProvider` genişletme:** `huggingface | together | groq | selfhosted`. (`ollama`/`vllm` ayrı tür değil, `selfhosted` altında taban URL farkıdır.)
3. **Embedding adapter'ı** (Tier 1): `embed(texts)` — başlangıçta HF Inference Providers veya self-host; vektör `pgvector` sütunlarına (mevcut `exam_chunks.embedding` düzeni) yazılır. Ayrı sözleşme: JSON metin üretmez.
4. **Yapılandırma temelli yönlendirme tablosu** (`lib/ai-gateway/routing-policy.ts`, sürümlü JSON/TS sabiti; ortam değişkeni ile geçersiz kılma): görev → {asgari kademe, izinli sağlayıcılar, hassasiyet sınıfı, gecikme bütçesi, kalite eşiği, yedek zinciri}. `buildIntelligenceRoutePlan` bu tablodan okur; sabit `openai/claude/gemini/mistral` seçimi kalkar. Davranış, bayrak kapalıyken bugünküyle **aynı** kalır.
5. **Ortak dayanıklılık sarmalayıcısı** (`withResilience`): zaman aşımı, sınırlı yeniden deneme (üstel geri çekilme + jitter), sağlayıcı bazlı oran sınırı, devre kesici. Vercel sunucusuz ortamda bellek içi durum örnek ömürlüdür; bu yüzden kesici kararı **kısa TTL'li ölçüm önbelleğinden** (`ai_usage_logs`/yeni özet) beslenir — `measured-quiz-router.ts`'in zaten yaptığı desen.
6. **Gölge çıkarımın genelleştirilmesi:** `ai_shadow_evaluations` quiz'e özgü kolonlar içeriyor (`expected_count`, `duplicate_count`); görev-bağımsız metrik tablosu (`ai_task_shadow_runs`: görev, kontrol/gölge sağlayıcı-model, kalite puanı, JSON geçerli, süre, token, maliyet, hata kodu; **ham içerik yok**) önerilir. Yeni tablo → migration → onay gerekir.
7. **PII koruma katmanı** (`lib/ai-gateway/pii-guard.ts`): sağlayıcıya çıkan her istemden ad/e-posta/telefon/kimlik no kalıplarını çıkaran ve hassasiyet sınıfı S3 olan isteği dış sağlayıcıya göndermeyi reddeden tek geçit (bkz. `HUGGINGFACE_SECURITY.md`).

## 3. Ortak sağlayıcı arayüzü (normalizasyon)

Mevcut `AIProviderAdapter.execute(request, context)` korunur; istek/yanıt normalleştirilir:

```ts
// Öneri — mevcut tipleri genişletir, yerine geçmez
interface NormalizedRequest {
  task: IntelligenceTask
  messages: Array<{ role: 'system'|'user'|'assistant'; content: string }>
  maxTokens: number
  temperature?: number
  json?: { schemaName: string; schema: JsonSchema }   // yapılandırılmış çıktı
  timeoutMs: number
  sensitivity: 'S0'|'S1'|'S2'|'S3'
}
interface NormalizedResponse {
  text: string; parsed?: unknown          // json şemaya göre doğrulanmış
  model: string; provider: AIProvider; revision?: string  // HF için commit SHA
  inputTokens: number; outputTokens: number; cacheReadTokens?: number
  durationMs: number; costUsd: number     // computeCostUsd (ai-pricing.ts)
  finishReason: 'stop'|'length'|'error'
}
```

| Standart | Karşılığı |
|---|---|
| İstek/yanıt normalizasyonu | Yukarıdaki sözleşme; sağlayıcı farkları adapter içinde (Anthropic `system` alanı + `thinking`, Mistral `response_format`, Gemini `usageMetadata`) |
| Yapılandırılmış çıktı | Her sağlayıcıda JSON şema doğrulama (yerel, `zod`/ajv); doğrulama başarısızsa **bir** onarım denemesi, sonra yedek |
| Zaman aşımı | Bugün dağınık (`timeoutMs`, `AbortSignal`) → adapter başına zorunlu |
| Yeniden deneme | Yalnız ağ/5xx/429 için, en çok 1–2 kez; **ücretli çağrıyı tekrarlamadan önce** devre kesici kontrolü |
| Oran sınırı | Kullanıcı bazlı mevcut `checkRateLimit` + yeni sağlayıcı bazlı eşzamanlılık sınırı |
| Devre kesici | Açık/yarı açık/kapalı; hata oranı > eşik → sağlayıcıyı kısa süre dışla; Gemini'deki %100 `provider_error` örüntüsü bunun ilk kullanım yeri |
| Yedekleme | `routing-policy` yedek zinciri; Tier düşüşü yalnız kalite eşiği izin verirse |
| Maliyet izleme | `ai-pricing.ts` tablosuna HF/Together/Groq/self-host fiyatları (dönemsel fiyat desteği hazır) |
| Gecikme izleme | `duration_ms` **tüm** çağrılarda zorunlu (bugün Anthropic'te boşluklar var) |
| Kalite izleme | `quality-engine` sinyalleri + gölge puanları → `ai_usage_logs.meta.quality` |
| Hata yönetimi | `meta.outcome` (`success|error|invalid_output|timeout`) **zorunlu**; bugün çoğu satırda boş |

API anahtarları yalnızca sunucu ortam değişkenlerinde kalır; hiçbir sağlayıcı anahtarı istemciye gönderilmez (mevcut desen böyle: tüm çağrılar `app/api/**` rotalarında).

## 4. Hugging Face üç yüzü ve mimaride yeri

| | Hub | Inference Providers | Inference Endpoints |
|---|---|---|---|
| Ne | Model/veri deposu | Üçüncü taraf sağlayıcılara HF üzerinden token başı yönlendirme | Ayrılmış, saatlik GPU |
| Ücret | Yok (depo) | Token başı | Saatlik (dakikalık faturalama) |
| Veri politikası | — | **Sağlayıcıya göre** (HF sorumluluğu devretmiyor) | HF yük saklamaz, günlük 30 gün |
| Pratium'da rol | Ağırlık kaynağı (yalnız self-host/Endpoints için) | Kademe 1–3 için **gölge ve ilk canlı kanarya** | Yalnız onay + ölçüm sonrası; PII içeren iş yükü için tercih edilen yol |
| Risk | Tedarik zinciri | Sağlayıcı değişimi, retention belirsizliği | Boşta kalan GPU maliyeti |

Kural: öğrenci içeriği içeren (S2+) istekler yalnızca sözleşmesi/DPA'sı doğrulanmış sağlayıcıya veya ayrılmış endpoint'e gider; anonim/genel içerik (S0–S1) için Providers kullanılabilir.

## 5. Hassasiyet sınıfları (router girdisi)

| Sınıf | Örnek | Dış sağlayıcı |
|---|---|---|
| S0 | MEB müfredat metni, kamuya açık soru metni | Serbest |
| S1 | Anonim soru/yanıt istatistikleri | Serbest |
| S2 | Öğrencinin serbest metin cevabı, kümelenmiş yanılgı, öğrenci seviyesi | Yalnız DPA'lı sağlayıcı, adsız/yalnız `pseudonym_id` |
| S3 | Ad-soyad, e-posta, telefon, T.C. kimlik no, veli bilgisi | **Hiçbir dış LLM'e gönderilmez**; gönderme ihtiyacı doğarsa istem yeniden tasarlanır |

## 6. Kademe önerisi (kademe ↔ görev)

| Kademe | Görevler |
|---|---|
| T0 | Yapısal doğrulama, sayısal/CAS cevap kontrolü, MinHash tekrar, onaylı içerik önbelleği |
| T1 | bge-m3 gömme, kazanım eşleme, benzer soru, yanılgı kümeleme, zorluk sınıflandırıcı |
| T2 | Qwen3-8B / Gemma 4 / Mistral Small: soru kalite hakemi, kısa geri bildirim, toplu işler |
| T3 | Mistral Large, Qwen3-235B-A22B, Gemma 4 31B: genel üretim (kanıtlanırsa) |
| T4 | GPT-4.1/5 sınıfı: bağımsız doğrulama |
| T5 | Claude Sonnet/Opus: açık uçlu puanlama, zor üretim, çok modlu |

Hiçbir görev "ucuz" diye kademe indirilemez; indirme koşulu `HUGGINGFACE_BENCHMARK_PLAN.md`'deki eşiklerin geçilmesidir.

## 7. Dokunulmayacak noktalar

`generate-quiz/route.ts` içindeki canlı mantık, mevcut sağlayıcı kovaları (`GPT_PILOT_FRACTION` %90 / Claude %10), `tutor-safety-v3`, `agent-decision-audit`, `ai-cost-alert` aynen kalır. Yeni katman bayrakla (`AI_GATEWAY_V4=off` varsayılan) devreye girer.
