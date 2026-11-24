# PRATIUM — Güvenlik ve Veri Gizliliği Değerlendirmesi (Aşama 7)

Tarih: 24 Kasım 2026. Çocukların eğitim verisi işlendiği için bu belge, diğer tüm AI işlerinin önünde gelir. Hukuki görüş değildir; KVKK/GDPR maddeleri, hukuk danışmanı tarafından teyit edilmelidir.

## 1. Mevcut durumda bulunanlar

| # | Bulgu | Kanıt | Risk | Önerilen işlem |
|---|---|---|---|---|
| S-1 | **Öğrenci tam adı LLM istemine yazılıyor** (3 yer) | `app/api/ai-analysis/route.ts:28-37` (`identity.full_name`), `lib/study-plan-generator.ts:209` (`opts.displayName`), `app/api/teacher/analyze/route.ts:143` (`Ad: …full_name`) | Kimlik verisinin dış sağlayıcıya sızması; "kimlik yalnız TR-PG'de" ilkesi ve veri minimizasyonuyla çelişir | **P0:** adı kaldır ("Öğrenci" ya da takma ad), PII koruma katmanı ekle, birim test |
| S-2 | Serbest metin öğrenci cevabı/koç sohbeti istemleri PII temizlemesinden geçmiyor | `lib/open-ended-grading.ts`, `app/api/chat/route.ts`, `lib/coach-generation.ts` | Öğrenci cevaba ad/telefon yazabilir | P0/P1: gelen metinde kalıp tabanlı PII maskeleme (e-posta, telefon, T.C. kimlik no, IBAN) |
| S-3 | Sağlayıcı bazlı veri saklama/eğitim politikası belgelenmemiş | Mevcut `KVKK-VERI-ENVANTERI` AI sağlayıcılarını "saklamaya tabi" diye bırakıyor | Silme talebi/aktarım yükümlülüğü eksik kalabilir | P1: sağlayıcı kayıt defteri (aşağıda §3) |
| S-4 | Yurt dışı aktarım (KVKK m.9) hukuki dayanağı AI sağlayıcıları için ayrıca belgelenmemiş | — | Uyum riski | Hukuk ile teyit: açık rıza/standart sözleşme/yeterlilik |
| S-5 | Ham içerik telemetriye yazılmıyor | `ai_shadow_evaluations` yalnız metrik; `ai_usage_logs` yalnız token/maliyet | İyi — korunmalı | Yeni tablolarda aynı ilke |
| S-6 | Anahtarlar sunucu tarafında | Tüm çağrılar `app/api/**` rotalarında | İyi — korunmalı | Yeni sağlayıcı anahtarlarını da yalnız Vercel ortam değişkeni olarak ekle |
| S-7 | Denetim izi var | `writeAgentDecisionAudit` (`tutor-safety-v3`, `assigned-student-analysis-v1`) | İyi | Yönlendirme kararlarına (görev, kademe, sağlayıcı, `reasonCode`) yaygınlaştır — içerik olmadan |

## 2. Veri hassasiyeti sınıfları (router girdisi)

| Sınıf | İçerik | İzinli yol |
|---|---|---|
| S0 | Kamu/müfredat metni | Her sağlayıcı |
| S1 | Anonim istatistik, anonim soru metni | Her sağlayıcı |
| S2 | Öğrencinin serbest metin cevabı, seviye/yanılgı profili | Yalnız DPA'sı ve saklama politikası doğrulanmış sağlayıcı; yalnız takma ad kimliği; PII maskeli |
| S3 | Ad-soyad, e-posta, telefon, T.C. kimlik no, veli bilgisi | **Hiçbir dış sağlayıcıya gönderilmez** |

Kural: `containsSensitiveStudentData` bayrağı (`contracts.ts`) bugün router tarafından okunmuyor; yönlendirme tablosu bu bayrağı **zorunlu** girdi yapmalı ve S3'te çağrıyı reddetmelidir.

## 3. Sağlayıcı veri politikası kayıt defteri (doldurulacak — doğrulanmadı)

Her sağlayıcı için sözleşme/DPA, saklama süresi, eğitimde kullanım, bölge, alt işleyici, silme prosedürü. Bu çalışmada yalnız şu doğrulanabildi:

| Yol | Doğrulanan | Kaynak |
|---|---|---|
| HF Inference Providers | HF, sağlayıcıların güvenlik/veri işlemesinden sorumlu olmadığını, kullanıcıyı sağlayıcı politikasına yönlendirdiğini belirtiyor; TLS ile taşınır | [Security & Compliance](https://huggingface.co/docs/inference-providers/security) |
| HF Inference Endpoints | Yük/token saklanmıyor; günlükler 30 gün tutuluyor | [Endpoints güvenlik](https://huggingface.co/docs/inference-endpoints/en/security) |
| KVKK'ya özgü HF/sağlayıcı taahhüdü | **Bulunamadı** | — |
| Together, Groq, OpenAI, Anthropic, Google, Mistral saklama/eğitim politikaları | **Bu çalışmada doğrulanmadı** | Sözleşmeden/dashboard'tan teyit edilecek |

Karar: S2 veri, **sözleşmesel garantisi olmayan Providers/ücretsiz katmanlara gönderilmez**. S2 için seçenekler: (i) DPA imzalı sağlayıcı, (ii) ayrılmış Inference Endpoint (AB/uygun bölge), (iii) self-host.

## 4. KVKK / GDPR kontrol listesi

| Konu | Gereken | Durum |
|---|---|---|
| Veri minimizasyonu | İstemde yalnız görev için gereken veri | S-1 açık |
| Amaçla sınırlılık | AI çıktısı yalnız belirtilen amaçla | Mevcut politika (`docs/DATA_LIFECYCLE_KVKK_V1.md`) üzerinden kontrol |
| Silme/imha | Sağlayıcıda saklanan veriyi silme yolu | Sağlayıcı kayıt defteri + Zero retention talebi |
| Açık rıza / aydınlatma | AI işlemesi ve yurt dışı aktarımı aydınlatma metninde | Hukuk teyidi |
| 18 yaş altı | Veli onayı akışı (mevcut doğrulama durumu var) | Mevcut akışa bağlı |
| Veri ihlali bildirimi | Sağlayıcı olay bildirimi süreci | Sağlayıcı sözleşmesinde |
| Tenant izolasyonu | Önbellek anahtarları kurum/öğretmen kapsamını içermeli; kişiselleştirilmiş yanıt tenant'lar arası paylaşılmaz | Yeni önbellekte zorunlu kural |
| Veri saklama | `ai_usage_logs`/gölge tabloları için saklama süresi (öneri: ham içerik yok; metrik 12 ay) | Karar bekliyor |
| RBAC | Benchmark/gölge tabloları yalnız `service_role`; yönetici arayüzü rol kontrollü | Mevcut desen (`revoke … from anon, authenticated`) |
| Denetim günlüğü | Yönlendirme + onay kararları | S-7 genişletme |

## 5. Hugging Face model tedarik zinciri kontrolleri

Uygulanacak **zorunlu** kurallar (model üretim yoluna girmeden önce):

1. **Lisans doğrulama:** model kartındaki lisans etiketi + depodaki `LICENSE` dosyası birlikte okunur; ikisi çelişirse model reddedilir. Türevlerin (ince ayar, GGUF/ONNX dönüşümü) lisansı tabandan ayrı doğrulanır — örnek: bir Türkçe Whisper LoRA'sı ticari olmayan lisanslı, başka bir ince ayar MIT. Kapılı (gated) modellerde (ör. Llama) kabul kaydı arşivlenir.
2. **Köken (provenance):** yalnız resmî kuruluş hesapları (ör. `BAAI`, `Qwen`, `google`, `mistralai`, `microsoft`, `openai`, `deepseek-ai`); topluluk dönüşümleri (GGUF, ONNX, "unsloth/..." vb.) ancak doğrulanmış kaynaktan ve sağlama (hash) karşılaştırmasıyla.
3. **Sürüm sabitleme:** `revision=<commit SHA>`; `main` veya `latest` kullanılmaz. SHA, model kartı özeti ve LICENSE dosyası depoda `docs/ai/models/<ad>.md` olarak arşivlenir.
4. **Safetensors tercihi:** yalnız `.safetensors`; `pickle`/`.bin`/`.pt` ağırlıklar reddedilir (rastgele kod çalıştırma riski).
5. **Uzaktan kod yok:** `trust_remote_code=False` (varsayılan ve zorunlu). Gerektiren modelde kod depoda incelenip yerel olarak vendor'lanır, yoksa model dışlanır.
6. **Bağımlılık doğrulama:** vLLM/Transformers/Ollama sürümleri sabit, imaj özetleri (digest) sabit; `pip-audit`/imaj taraması; SBOM çıktısı.
7. **Yerel aynalama:** onaylanan ağırlıklar özel nesne depolamaya kopyalanır; üretim, Hub'dan canlı indirmez (kaynak ele geçirilirse/depo değişirse etkilenmemek için).
8. **Zararlı yazılım taraması:** Hub tarama sonucu + yerel tarama (pickle tarayıcı gerekmez, safetensors dışı dosya varlığı bayrak).
9. **Ağ çıkışı:** self-host çıkarım sunucusunun internete çıkışı kapalı; yalnız iç ağ.
10. **Ücretli kaynak onayı:** endpoint/GPU açmak elle onay kapısıdır (§Uygulama Planı).

## 6. Gizli anahtar (secret) yönetimi

* Her sağlayıcı için ayrı anahtar; ortam başına (preview/production) ayrı; asgari yetki (HF'de ince taneli **salt-okunur** token; yalnız gereken modellere).
* Anahtarlar yalnız Vercel ortam değişkeni; kodda/günlükte/istemcide yok; 90 günde bir veya sızıntıda döndürülür.
* İstemci tarafına hiçbir sağlayıcı anahtarı veya tam model yanıtı hata ayrıntısı döndürülmez (mevcut Gemini düzeltmesindeki gibi yalnız durum kodu günlüğe).

## 7. Önceliklendirilmiş güvenlik işleri

| Öncelik | İş |
|---|---|
| P0 | S-1: öğrenci adını LLM istemlerinden çıkar + PII koruma geçidi + testler |
| P0 | `containsSensitiveStudentData`'yı yönlendirmede zorunlu kıl; S3 → dış çağrı reddi |
| P1 | Sağlayıcı veri politikası kayıt defteri + hukuk teyidi (KVKK m.9) |
| P1 | Serbest metin cevaplarda PII maskeleme |
| P1 | Yönlendirme kararlarının denetim izi |
| P2 | Model Doğrulama Kartı süreci, yerel ağırlık aynası, imaj sabitleme |
| P2 | Önbellek tenant kapsam anahtarları |
