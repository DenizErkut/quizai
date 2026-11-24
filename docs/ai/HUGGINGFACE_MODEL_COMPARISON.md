# PRATIUM — Hugging Face Model Araştırması ve Karşılaştırma (Aşama 2)

Tarih: 24 Kasım 2026. **Bu belge bir ön eleme listesidir, model seçimi değildir.** Hiçbir model Pratium verisiyle ölçülmedi; kalite, hallucination, JSON uyumu ve Türkçe başarımı sütunları bilinçli olarak "ölçülmedi"dir ve `HUGGINGFACE_BENCHMARK_PLAN.md` ile doldurulacaktır.

## Doğrulama durumu — nasıl okunmalı

Çalışma ortamı `huggingface.co` alan adına doğrudan erişemiyor (proxy 403), bu yüzden bilgiler web aramasıyla Hugging Face model kartlarından/duyurulardan alındı. Her satırda:

* ✅ = arama sonucunda resmî model kartı/duyuru içeriğiyle görüldü (bağlantı verilmiş).
* ◻ = doğrulanamadı; **üretime almadan önce model kartı ve LICENSE dosyası elle teyit edilmeli.**

Model sürümleri hızla değişir. "Resmî kaynaktan doğrulandı" demek için her aday için `revision` (commit SHA) sabitlenip LICENSE dosyasıyla birlikte arşivlenmelidir (`HUGGINGFACE_SECURITY.md`).

## 1. Aday ailelerin doğrulanmış lisans/erişim bilgisi

| Aile / model | Lisans | Durum | Kaynak |
|---|---|---|---|
| BAAI/bge-m3 (embedding; yoğun+seyrek+ColBERT, çok dilli) | MIT | ✅ | [HF model kartı](https://huggingface.co/BAAI/bge-m3/blame/main/README.md) |
| Qwen3 (LLM; 8B, 235B-A22B vb.) | Apache-2.0; teknik rapora göre 119 dil | ✅ (8B ve 235B-A22B kartları) | [Qwen3-235B-A22B](https://huggingface.co/Qwen/Qwen3-235B-A22B/raw/main/README.md), [Qwen3-8B LICENSE](https://huggingface.co/Qwen/Qwen3-8B/blob/main/LICENSE), [Teknik rapor](https://huggingface.co/papers/2505.09388) |
| Qwen3-Embedding-8B | ◻ (lisans kartı doğrulanmadı) | Qwen ekibi MTEB multilingual 70,58 bildiriyor (Haz 2025, **kendi bildirimi**) | [Qwen blog](https://qwenlm.github.io/blog/qwen3-embedding) |
| Gemma 4 (E2B, E4B, 26B MoE, 31B yoğun; 2 Nis 2026) | Apache-2.0 (önceki Gemma lisansından değişti) | ✅ basın/Google duyurusu; model kartı ◻ | [Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/), [eWeek](https://www.eweek.com/news/google-gemma-4-apache-2-open-models/) |
| Gemma 3 | "Gemma Terms of Use" (Apache değil; ticari kullanım koşullu) | ✅ ikincil kaynak; resmî metin ◻ | [HF blog](https://huggingface.co/blog/daya-shankar/open-source-llm-models-to-run-locally) |
| Mistral Small 3.x (24B) | Apache-2.0 | ✅ | [Mistral-Small-24B-Instruct-2501](https://huggingface.co/mistralai/Mistral-Small-24B-Instruct-2501) |
| Llama 3.3 70B | Llama 3.3 Community License + Kabul Edilebilir Kullanım Politikası (özel lisans) | ✅ | [Llama-3.3 kartı](https://huggingface.co/unsloth/Llama-3.3-70B-Instruct-GGUF/raw/main/README.md) |
| Phi-4-reasoning (14B), Phi-4-mini-reasoning | MIT; kart "yalnızca matematik muhakemesi için tasarlanıp test edildi" diyor | ✅ | [Phi-4-reasoning](https://huggingface.co/microsoft/Phi-4-reasoning), [Phi-4-mini-reasoning](https://huggingface.co/microsoft/Phi-4-mini-reasoning) |
| DeepSeek-R1-Distill-Qwen/Llama | MIT (taban Qwen-2.5 Apache-2.0; Llama türevleri için taban lisansı ayrıca incelenmeli) | ✅ | [R1-Distill-Qwen-32B](https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B/blob/main/LICENSE) |
| openai/whisper-large-v3-turbo | MIT (ikincil kaynak) | ◻ resmî kart doğrulanmadı | [Türkçe ince ayar kartı](https://huggingface.co/selimc/whisper-large-v3-turbo-turkish) |
| PaddleOCR-VL (0,9B, 109 dil) | ◻ | HF blogu "açık lisanslı" diyor; metin ◻ | [HF OCR blogu](https://huggingface.co/blog/ocr-open-models) |
| olmOCR (Qwen2.5-VL tabanlı) | ◻ | ◻ | aynı blog |
| Qwen3-VL (OCR/görsel) | ◻ (LLM'den ayrı doğrulanmalı) | ◻ | aynı blog |
| multilingual-e5-large(-instruct), Sentence-Transformers türevleri | ◻ | ◻ | — |
| gpt-oss-120b / 20b (Groq/Together'da barındırılıyor) | ◻ | fiyatı ikincil kaynaklarda | [Groq fiyat özeti](https://www.morphllm.com/groq-pricing) |

**Türkçe TTS lisansları:** XTTS-v2 (Coqui Public Model License, ticari değil), `facebook/mms-tts-tur` (CC-BY-NC 4.0), `F5-TTS-Turkish` (CC-BY-NC 4.0) → **üretim için dışarıda.** Ticari kullanıma daha yakın görünenler: `okur-tts` (kod Apache-2.0, ağırlıklar CC-BY 4.0, tek ses, küçük model), `pocket-tts-tr` (CC-BY 4.0; taban lisansı ◻), Piper `tr_TR-dfki` (MIT, anket kaynağına göre) — hepsi kaynağından doğrulanmalı. ([TTS araması](https://danielquillanroxas.github.io/turkish-tts-survey))

**Türkçe ASR uyarısı:** Topluluk ince ayarlarının lisansı farklıdır; örneğin bir Türkçe LoRA ince ayarı ticari olmayan lisanslıdır ([RsGoksel kartı](https://huggingface.co/RsGoksel/RsGoksel_ITU_Mainframe)). Kartlardaki WER değerleri (ör. 18,92 Common Voice 17) **yazarların kendi ölçümüdür**, bağımsız değildir.

**Türkçe değerlendirme kaynakları (rakam kullanmıyoruz, yöntem alıyoruz):** CETVEL (33 açık model; "Türkçe odaklı modeller genel amaçlıları geçmiyor" bulgusu) ve TurkBench (8.151 örnek, 21 alt görev). ([CETVEL](https://arxiv.org/pdf/2508.16431), [TurkBench](https://aclanthology.org/2026.sigturk-1.12))

## 2. Görev bazlı adaylar (her görev için ≥ 3 alternatif)

Kademe → `HUGGINGFACE_ARCHITECTURE.md` (T0 deterministik … T5 çok modlu). "Mevcut" = bugün üretimde kullanılan.

| # | Görev | Mevcut | Aday 1 | Aday 2 | Aday 3 | Önerilen ilk adım |
|---|---|---|---|---|---|---|
| 1 | MEB kazanım eşleştirme | LLM (backfill ≈ 12 USD) | bge-m3 (T1) + onaylı eşleşme önbelleği | multilingual-e5-large-instruct ◻ (T1) | Qwen3-Embedding ◻ (T1) + Qwen3-8B/Gemma 4 ile belirsiz olanları yeniden hakem (T2) | Çevrimdışı ölçüm; altın veri: onaylı kazanım eşleşmeleri |
| 2 | Yanılgı kümeleme | Sonnet 5.5 | bge-m3 + kümeleme (T1) | e5 ◻ + kümeleme | Qwen3-Embedding ◻ + kümeleme; etiketleme Qwen3-8B (T2) | Mevcut kümeleri "altın" alıp uyum (ARI) ölç |
| 3 | Benzer soru tespiti | metin normalizasyonu | MinHash (T0) | bge-m3 (T1) | e5 ◻ (T1) | `question_bank` (5.774) üzerinde çevrimdışı |
| 4 | Zorluk sınıflandırma | LLM + ölçüm tabloları | Gradient boosting/lojistik regresyon (T1; `question_difficulty_measurements`) | bge-m3 gömme + sınıflayıcı | Qwen3-8B / Gemma 4 E4B ile gerekçeli etiket (T2) | Etiketli veri miktarı kontrolü |
| 5 | Soru kalite kontrol | GPT/Gemini/Mistral zinciri | T0 `quality-engine` (mevcut) | Qwen3-8B/Gemma 4 hakem (T2) | Mistral Small 3.x hakem (T2) | Gölge: mevcut doğrulayıcılarla uyum |
| 6 | Açık uçlu cevap değerlendirme | Sonnet 5.5 | Qwen3-235B-A22B (T3/4) | Gemma 4 31B (T3) | Mistral Small 3.x / gpt-oss-120b ◻ | Yalnızca gölge; insan puanlı altın set şart |
| 7 | Anlamsal arama | **kapalı** (0 embedding) | bge-m3 | multilingual-e5 ◻ | Qwen3-Embedding ◻ | Çevrimdışı geri çağırma testi |
| 8 | Embedding üretimi | Gemini `text-embedding-004` (kullanım kaydı yok; model durumu ◻) | bge-m3 | e5 ◻ | Qwen3-Embedding ◻ | Aynı |
| 9 | Çok dilli içerik | Claude/GPT | Qwen3 (119 dil, ✅ rapor) | Gemma 4 (◻ dil sayısı) | Mistral Small 3.x | Dil başına altın set |
| 10 | Matematiksel muhakeme | GPT/Claude | **T0 CAS doğrulama** (en güçlü) | Phi-4-reasoning 14B (MIT) | DeepSeek-R1-Distill / Qwen3 düşünme modu | Soru çözümü yerine *doğrulama* görevi |
| 11 | Görsel soru analizi | Gemini-3.6-flash, GPT-4.1-mini | Gemma 4 (çok modlu ◻) | Qwen3-VL ◻ | Mistral Small 3.1 görsel ◻ | Yalnızca ölçüm |
| 12 | OCR | Gemini Vision, Sonnet | PaddleOCR-VL ◻ | olmOCR ◻ | Qwen3-VL ◻ | El yazısı/Türkçe karakter ölçümü |
| 13 | Kişiselleştirilmiş geri bildirim | Sonnet 5.5 | Qwen3-8B / Gemma 4 | Mistral Small 3.x | Llama 3.3 70B (özel lisans) | PII temizlenmiş istemle gölge |
| 14 | Öğrenci AI koçu | Sonnet 5.5 | Gemma 4 | Qwen3 | Mistral Small | **Güvenlik katmanı korunur** (`tutor-safety-v3`) |
| 15 | Speech-to-text | Gemini ses | Whisper large-v3-turbo | faster-whisper (CTranslate2 uygulaması ◻) | Türkçe ince ayarlı Whisper (lisansı tek tek) | Düşük öncelik (P3) |
| 16 | Text-to-speech | OpenAI `tts-1`, `gpt-4o-mini-tts` | Piper tr_TR ◻ | okur-tts ◻ | pocket-tts-tr ◻ | Düşük öncelik; mevcut sesler korunur |

## 3. Değerlendirme matrisi (13 kriter)

Ön eleme matrisi. "?" = ölçülmedi/doğrulanmadı. Hiçbir benchmark değeri uydurulmamıştır.

| Kriter | bge-m3 | Qwen3 (LLM) | Gemma 4 | Mistral Small 3.x | Llama 3.3 70B | Phi-4-reasoning | Whisper v3-turbo |
|---|---|---|---|---|---|---|---|
| Türkçe dil kalitesi | ? (gömme) | ? (119 dil iddiası, ✅ rapor) | ? | ? | ? | ? | ? (yazar WER'leri var) |
| Çok dil | ✅ çok dilli | ✅ 119 dil | ◻ | ◻ | ◻ | ? (kart yalnızca matematik muhakemesi için test edildiğini söylüyor) | ◻ |
| Pedagojik doğruluk | ? | ? | ? | ? | ? | ? | — |
| Matematik doğruluğu | — | ? | ? | ? | ? | kartta matematik için tasarlandı | — |
| JSON çıktı başarısı | — | ? | ? | ? | ? | ? | — |
| Hallucination | — | ? | ? | ? | ? | ? | — |
| Bağlam penceresi | ◻ | ◻ (karta bakılacak) | ◻ | ◻ | ◻ | ◻ | — |
| Gecikme | ? | ? | ? | ? | ? | ? | ? |
| GPU/RAM | küçük (CPU ile de ◻) | boyuta bağlı | boyuta bağlı | 24B ≈ tek 48 GB GPU ◻ | 70B ≈ çok GPU/nicemleme | 14B | orta |
| Ticari lisans | ✅ MIT | ✅ Apache-2.0 | ✅ Apache-2.0 (◻ kart) | ✅ Apache-2.0 | ⚠ özel lisans + AUP | ✅ MIT | ◻ MIT |
| API erişimi | HF Providers/Endpoints ◻ | Together/Groq/HF ✅ listeler | ◻ | ✅ | ◻ (Together'da sürüm çelişkisi) | ◻ | ◻ |
| Tahmini maliyet | `HUGGINGFACE_COST_ANALYSIS.md` | aynı | aynı | aynı | aynı | aynı | aynı |
| Veri güvenliği | sağlayıcıya bağlı | sağlayıcıya bağlı | sağlayıcıya bağlı | sağlayıcıya bağlı | sağlayıcıya bağlı | sağlayıcıya bağlı | sağlayıcıya bağlı |

## 4. Erişim yolları ve fark (Hub / Providers / Endpoints)

* **Hub:** yalnızca model deposu (ağırlık, kart, lisans). İndirilen ağırlık bizim altyapımızda çalıştırılır (vLLM/Ollama/Transformers). Tedarik zinciri riski burada.
* **Inference Providers:** HF üzerinden üçüncü taraf sağlayıcılara yönlendirilen **token başı** ücretli sunucusuz çağrı. Fiyat ve veri politikası sağlayıcıya göre değişir; HF güvenlik sayfası sağlayıcıların kendi güvenlik/veri işlemesinden sorumlu olduğunu söyler ([Security & Compliance](https://huggingface.co/docs/inference-providers/security)). Örnek fiyatlar sağlayıcı ve modele göre değişir ([model listesi](https://huggingface.co/inference/models)).
* **Inference Endpoints:** **saatlik** ücretli ayrılmış GPU. Örnek tarifeler: T4 0,40–0,60 · L4 0,80 · L40S 1,80 · A100 2,50 · H200 5 USD/sa, dakikalık faturalama ([fiyat sayfası](https://huggingface.co/docs/inference-endpoints/en/pricing); sayfa 79 günlük veriyle uyarı veriyor, canlı sayfa teyit edilmeli). HF belgesine göre yük (payload) saklanmaz, günlükler 30 gün tutulur ([Endpoints güvenlik](https://huggingface.co/docs/inference-endpoints/en/security)). **Ücretli endpoint açmak onay gerektirir.**
* Groq (gpt-oss-120b: 0,15/0,60 USD/M token) ve Together (Qwen3.5 9B: 0,17/0,25 USD/M) fiyatları **ikincil kaynaklardan**; Together'da Llama 3.3 70B'nin hâlâ sunucusuz olup olmadığı kaynaklar arasında çelişkili ([Groq](https://www.morphllm.com/groq-pricing), [Together](https://www.morphllm.com/together-ai-pricing)).

## 5. Sonuç

1. Ticari açıdan en temiz adaylar: **bge-m3 (MIT), Qwen3 (Apache-2.0), Gemma 4 (Apache-2.0), Mistral Small 3.x (Apache-2.0), Phi-4-reasoning (MIT), Whisper (MIT ◻)**. Llama 3.3 ve Gemma 3 özel lisanslıdır; hukuk onayı olmadan kullanılmamalı.
2. En yüksek getirili ve en düşük riskli ilk iş modelin kendisi değil: **Tier 0/1 (deterministik + embedding)**. Çünkü embedding altyapısı bugün fiilen kapalı (0 embedding) ve hata riski düşük.
3. Pedagojik açıdan kritik görevler (açık uçlu puanlama, koç) için hiçbir açık model, ölçümle kanıtlanana kadar Claude'un yerini almaz.
4. Doğrulanamayan tüm ◻ alanları `HUGGINGFACE_IMPLEMENTATION_PLAN.md` P1-2 maddesinde "Model Doğrulama Kartı" olarak kapatılacaktır.
