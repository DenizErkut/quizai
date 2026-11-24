# Model Doğrulama Kartları (P1-2)

Her aday model üretime girmeden önce bu klasörde bir kart (`<org>__<model>.json` + gerekirse `.md`) taşımalıdır. Kart, `scripts/ai-benchmark/verify-model-card.mjs` ile **huggingface.co'ya erişimi olan bir ortamda** üretilir (Node'un `fetch`'i proxy'yi kullanması için `NODE_USE_ENV_PROXY=1` ve `NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` ortam değişkenleri gerekir; script 24 Kasım 2026'da gerçek Hub'a karşı çalıştırıldı).

```
node scripts/ai-benchmark/verify-model-card.mjs BAAI/bge-m3 --out docs/ai/models
```

Kart alanları: commit SHA (sabitlenecek `revision`), lisans etiketi, safetensors/pickle durumu, `LICENSE` dosyası, kapılı mı, uzak kod gerekir mi, diller, son güncelleme; `humanApproval` alanı hukuk/teknik onay sonrası elle doldurulur. Uyarı kodları: `LİSANS_ETİKETİ_YOK`, `KAPILI_MODEL`, `SAFETENSORS_YOK`, `PICKLE_AĞIRLIK_VAR`, `LICENSE_DOSYASI_YOK`, `UZAK_KOD_GEREKİYOR`.

## Kart çıkarılacak adaylar (öncelik sırasıyla)

| # | Model (Hub kimliği — elle doğrula) | Görev | Önceki doğrulama (arama) |
|---|---|---|---|
| 1 | `BAAI/bge-m3` | Embedding (T1) | MIT etiketi görüldü |
| 2 | `intfloat/multilingual-e5-large-instruct` | Embedding (T1) | ◻ |
| 3 | `Qwen/Qwen3-Embedding-0.6B` / `-4B` / `-8B` | Embedding (T1) | ◻ (MTEB 70,58 iddiası Qwen'in kendi bildirimi) |
| 4 | `Qwen/Qwen3-8B` | T2 hakem/geri bildirim | Apache-2.0 görüldü |
| 5 | `Qwen/Qwen3-235B-A22B` | T3/T4 aday (açık uçlu, gölge) | Apache-2.0 görüldü |
| 6 | Gemma 4 (E4B, 31B) — resmî `google/…` kimlikleri | T2/T3 | Apache-2.0 duyurusu görüldü; kart ◻ |
| 7 | `mistralai/Mistral-Small-3.x-Instruct` | T2 | Apache-2.0 görüldü |
| 8 | `microsoft/Phi-4-reasoning` | Matematik (T3) | MIT görüldü |
| 9 | `openai/whisper-large-v3-turbo` | STT | MIT ikincil kaynak; ◻ |
| 10 | `PaddlePaddle/PaddleOCR-VL` | OCR | ◻ |

Özel lisanslı/koşullu modeller (`meta-llama/Llama-3.3-70B-Instruct`, Gemma 3) **hukuk onayı (G6) olmadan** kart onayı alamaz.

## Onay kuralı
`warnings` boş değilse model üretime alınmaz; her uyarı ya giderilir ya da yazılı gerekçeyle kabul edilir.
