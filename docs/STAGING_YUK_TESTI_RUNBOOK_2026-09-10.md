# Pratium staging ve yük testi runbook'u

## Staging

Vercel kullanılıyorsa `main` dışındaki her branch otomatik Preview (staging) deployment üretir. Preview ortamında ayrı Supabase projesi kullanılmalı; production `NEXT_PUBLIC_SUPABASE_URL` veya service role anahtarı staging'e kopyalanmamalıdır.

Gerekli değişkenler: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (yalnızca server), `NEXT_PUBLIC_SITE_URL` ve test sağlayıcısının e-posta/AI anahtarları. Preview URL'si oluşturulduktan sonra `LOAD_TEST_BASE_URL` olarak verilir.

## Senaryolar ve endpoint'ler

Kamuya açık akış: `GET /`, `GET /pricing`, `GET /login`.
Kimlikli akışlar gerçek test hesaplarıyla ayrıca çalıştırılmalıdır: `GET /api/student/adaptive-policy`, `POST /api/adaptive-answer`, `GET /api/recommendations`.

## Kademeli çalıştırma

```powershell
$env:LOAD_TEST_BASE_URL='https://<preview-url>'
foreach ($n in 100,500,1000,5000) { $env:LOAD_TEST_USERS=$n; $env:LOAD_TEST_ROUNDS=2; node scripts/load-test.mjs }
```

Her kademe en az iki tur sürdürülür. Hata oranı `%1` üzerine çıkarsa veya p95 önceki kademeye göre iki katına çıkarsa test durdurulur. AI üretim uçları sınırsız stres testine dahil edilmez; maliyet ve sağlayıcı rate-limit riski nedeniyle sentetik/mock yanıt kullanılır.

## İzleme kabul kriterleri

Vercel: function error rate, duration, concurrency ve memory. Supabase: Database > Reports altında CPU, connection count, query latency ve pool saturation. Uygulama: HTTP 4xx/5xx, timeout, p50/p95/p99 ve rate-limit (429). Her kademede zaman damgalı kayıt tutulur; production verisi veya gerçek öğrenci hesabı kullanılmaz.

Bu runbook ve `scripts/load-test.mjs` staging hedefi verilmeden production'a istek göndermez.
