# Pratium Multi‑AI Gateway v3 — Uygulama Planı

Bu belge, `PRATIUM_MULTI_AI_GATEWAY_V3_CANONICAL_ARCHITECTURE.md` referansının mevcut Pratium koduna güvenli geçiş planıdır. Referans belge ürün hedefini tarif eder; canlı sağlayıcı değişimi için tek başına yetki veya kalite kanıtı sayılmaz.

## Mevcut durum

- Anthropic çağrıları yaklaşık 20 API/yardımcı dosyasına doğrudan dağılmış durumda.
- OpenAI doğrulama, yedek üretim ve görsel açıklama için kullanılıyor.
- Gemini bağımsız doğrulama/multimodal noktalarında kullanılıyor.
- Merkezi kullanım ve maliyet günlüğü var; ancak merkezi karar/router katmanı yoktu.
- Learning Engine, sağlayıcı seçiminden ayrı kalmalıdır. Learning Event, mastery ve recommendation kayıtları gateway'in çıktısını tüketir; sağlayıcıya bağımlı olmaz.

## Bu sprintte tamamlanan P0 temel

- Sağlayıcıdan bağımsız istek bağlamı ve adapter sözleşmesi eklendi.
- L0–L5 seviyeleri ile model kayıt merkezi eklendi.
- Mistral-first, OpenAI-validation, Claude-premium ve Gemini-multimodal karar politikası kodlandı.
- `MISTRAL_API_KEY` yoksa mevcut Claude yolu korunur; sessiz sağlayıcı değişimi yapılmaz.
- Her karar `policyVersion` ve `reasonCode` üretir; sonraki telemetry/maliyet tablolarına yazılabilir.

## Kontrollü geçiş sırası

1. Router kararını `generate-quiz` içinde yalnızca gölge telemetry olarak kaydet.
2. Mistral adapter'ını ekle; gerçek öğrenci trafiği olmadan sabit değerlendirme setinde çalıştır.
3. Aynı soruları kalite, JSON geçerliliği, gecikme ve maliyet açısından mevcut Claude taban çizgisiyle karşılaştır.
4. Yalnızca eşikleri geçen küçük bir pilot grubunda Mistral üretimini aç.
5. OpenAI validator sonucunu Quality Engine kararına bağla; validator hatasında ana akışı çöktürme.
6. Onaylanmış içerik ve sonuç önbelleğini L1'e bağla.
7. Circuit breaker, timeout ve bütçe sınırlarını ekle.
8. Diğer doğrudan Anthropic çağrılarını risk sırasına göre gateway'e taşı.

## Aktivasyon eşikleri

- Geçerli JSON oranı en az `%99`.
- Eksik/bozuk interaktif soru alanı oranı `%0`.
- Pedagojik doğruluk mevcut üretim taban çizgisinden düşük olmamalı.
- P95 gecikme ve soru başı maliyet ayrı ayrı raporlanmalı.
- Pilot geri alma işlemi yalnızca ortam bayrağı değiştirerek yapılabilmeli.
- Ham öğrenci içeriği veya ham model çıktısı telemetry'ye yazılmamalı.

## Riskler

- Mistral anahtarı/modeli hazır olmadan Mistral-first'i zorlamak test üretimini keser.
- Sağlayıcıların JSON ve usage formatları farklıdır; adapter sınırında normalize edilmelidir.
- Aynı model kendisinin ürettiği soruyu tek başına doğrulamamalıdır.
- Maliyet başarısı pedagojik kalite yerine kullanılamaz.
- Learning Engine tabloları provider/model kimliklerine bağlanmamalıdır; bu bilgiler yalnızca üretim provenance/telemetry alanlarında tutulmalıdır.

## Sonraki somut teslimat

`generate-quiz` için Mistral adapter + shadow comparison pipeline hazırlandı:

- `MISTRAL_SHADOW_FRACTION=0` varsayılanıyla kapalıdır.
- Yalnızca K12, ilk test parçası ve kullanıcı dosyası içermeyen istekler uygundur.
- Gölge çağrı kullanıcı yanıtını bekletmeden response sonrasında çalışır.
- Veritabanına yalnızca adet, yapısal geçerlilik, tekrar, süre ve token metrikleri yazılır.
- Ham prompt, soru veya model yanıtı saklanmaz.

Sıradaki somut teslimat: 034 migrasyonunu kontrollü uygulamak, Mistral anahtarını
tanımlamak, `%1–5` gölge örneklemle en az 100 üretim toplamak ve eşikler
geçilmeden öğrenci trafiğini Mistral'a çevirmemek.
