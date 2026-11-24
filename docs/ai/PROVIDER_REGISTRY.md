# AI Sağlayıcı Veri Politikası Kayıt Defteri (P1-7)

Durum: **şablon + bilinenler**. Hukuk teyidi (G6) bekliyor. Boş/“?” hücreler doğrulanmamıştır ve S2 (öğrenci serbest metni) veriye izin vermez. Veri sınıfları için `HUGGINGFACE_SECURITY.md` §2.

| Sağlayıcı | Kullanım (bugün) | S0/S1 | S2 | S3 | Saklama süresi | Eğitimde kullanım | DPA/SCCs | İşleme bölgesi | Alt işleyiciler | Silme yolu | Kaynak/tarih |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Anthropic | Üretimde | ✓ | ? | ✗ | ? | ? | ? | ? | ? | ? | doğrulanacak |
| OpenAI | Üretimde | ✓ | ? | ✗ | ? | ? | ? | ? | ? | ? | doğrulanacak |
| Google (Gemini) | Üretimde | ✓ | ? | ✗ | ? | ? | ? | ? | ? | ? | doğrulanacak |
| Mistral | Üretimde (kısmen) | ✓ | ? | ✗ | ? | ? | ? | ? | ? | ? | doğrulanacak |
| HF Inference Providers | Kullanılmıyor | ✓ (yalnız anonim) | ✗ (sağlayıcıya bağlı) | ✗ | sağlayıcıya göre | sağlayıcıya göre | ? | sağlayıcıya göre | ? | ? | [HF güvenlik belgesi](https://huggingface.co/docs/inference-providers/security): sağlayıcı politikası geçerli |
| HF Inference Endpoints | Kullanılmıyor | ✓ | ? (ayrılmış endpoint ile mümkün) | ✗ | yük saklanmaz, günlükler 30 gün | — | ? | seçilen bölge | HF altyapısı | ? | [HF Endpoints güvenlik](https://huggingface.co/docs/inference-endpoints/en/security) |
| Together AI | Kullanılmıyor | ✓ (yalnız anonim) | ✗ | ✗ | ? | ? | ? | ? | ? | ? | doğrulanacak |
| Groq | Kullanılmıyor | ✓ (yalnız anonim) | ✗ | ✗ | ? | ? | ? | ? | ? | ? | doğrulanacak |
| Self-host (vLLM/Ollama) | Kullanılmıyor | ✓ | ✓ (altyapı politikasına bağlı) | ✗ | bizde | yok | gerekmez | seçilen | — | bizde | — |

**Kod karşılığı:** `lib/ai-gateway/adapters/openai-compatible.ts` içinde `allowSensitive` her yeni sağlayıcı için varsayılan `false`'tur; bu tablo bir sağlayıcı için S2 ✓ olmadıkça `AI_<AD>_ALLOW_SENSITIVE=1` ayarlanmamalıdır.

**Hukuk gündemi:** KVKK m.9 yurt dışı aktarım dayanağı (açık rıza/standart sözleşme/yeterlilik), 18 yaş altı veli aydınlatması, silme talebinin sağlayıcıya iletilmesi.
