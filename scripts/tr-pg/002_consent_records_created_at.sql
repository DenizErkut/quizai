-- scripts/tr-pg/002_consent_records_created_at.sql
--
-- ÖNEMLİ: Bu migration TR-PG'ye (Türkiye VPS'indeki pratium_identity
-- veritabanına) uygulanır — Supabase'e DEĞİL. Diğer scripts/*.sql
-- dosyalarının aksine, kimlik/rıza verisi (KVKK mimarisi gereği) tamamen
-- ayrı bir Postgres örneğinde yaşıyor.
--
-- 18 Ağustos 2026 — Madde 7 (pratium-bekleyen-isler-uygulama-plani.md):
-- lib/identity/client.ts'teki getConsentStatus(), bir kimliğin HER rıza
-- türü için EN SON verdiği onayı bulmak üzere consent_records.created_at
-- üzerinden sıralama yapıyor (yeniden-onay/versiyon karşılaştırması için).
-- Bu kolonun garanti altında olması için — zaten varsa bu komut güvenli
-- bir no-op'tur:
ALTER TABLE consent_records
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
