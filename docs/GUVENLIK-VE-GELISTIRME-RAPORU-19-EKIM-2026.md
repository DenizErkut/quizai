
---

## 6. Uygulama durumu (20 Ekim 2026 itibarıyla)

| Madde | Durum |
|---|---|
| D1, D2, D3, A1, A4 (bot/chat limiti), A5, A6 | **Tamamlandı (PR #79)** |
| A2, A3, A8 (sınıf sahipliği + negatif testler), A7 (canlı sınav kuralları), D9 (`live_quizzes` kapsamı) | **Tamamlandı (PR #80)** |
| A9 push SSRF, A10 `extract-file`, A11 AI/e-posta hız sınırları, A12 `coaching-leads`, A13 `identity/resolve`, A14 güvenlik başlıkları (CSP **Report-Only**), A15, A17, A18, A21, A24, A25 | **Tamamlandı (PR #81)** |
| D4 (anon yetkileri), D6 (`seller_id` bir kez atanır), D8 (kova sınırları), A16 (hata sızıntıları), D5 (`institutions` kapsamı + kuruma katılım yalnız sunucudan) | **Tamamlandı (PR #82 + canlı SQL)** |
| D9 devamı: canlı sınav doğru cevapları `live_quiz_keys` tablosuna taşındı, eski sorulardan `ans`/`exp` temizlendi | **Tamamlandı (PR #83)** |
| A19 dahili fetch kökü izin listesi, A22 eksik ödeme koruması, A23 PII günlüğü, A20 oturumsuz uçlarda IP sınırı (en iyi çaba), A26 notlama istemi enjeksiyon koruması | **Tamamlandı (PR #84)** |

**Bilerek bırakılanlar / karar gerektirenler**
- A14: CSP şimdilik yalnızca `Report-Only`; ihlal görülmediğinde `Content-Security-Policy`'ye çevrilmeli.
- A20: IP sınırı bellek içi ve örnek başına; kalıcı koruma için Vercel Firewall hız sınırı kuralı önerilir.
- `/api/bot` misafir kullanımı için IP bazlı sınır ve sunucu tarafı sistem istemi hâlâ yok (istemci `system` gönderiyor; uzunluk sınırlı).
- `identity/resolve`: genel liderlik tablosu nedeniyle ilişki kısıtı uygulanamadı (yalnızca sınır + rol gizleme); tasarım kararı gerekir.
- `classrooms/membership` roster'ındaki `plan` rozeti (ürün özelliği) ve sınıf arkadaşı kimlikleri korunuyor.
- `topic-summary`, `check-answer` hâlâ eski (atomik olmayan) `api_rate_limits` kodunu kullanıyor (tablo artık yalnız servis rolüne açık).
- Altyapı: `migrate-production` işi, eslint kapısı, `CRON_SECRET`/`TR_IDENTITY_DB_CA` ortam değişkenleri (Bölüm 4) hâlâ açık.
