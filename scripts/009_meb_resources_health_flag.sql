-- scripts/009_meb_resources_health_flag.sql
--
-- 18 Ağustos 2026 — Madde 8 (pratium-bekleyen-isler-uygulama-plani.md):
-- MEB kaynak yükleme "sağlık kontrolü". app/api/admin/meb-upload/route.ts
-- artık her yüklemede lib/content-filters.ts'teki runHealthCheck() ile üç
-- şüpheli sinyali (yuvarlak-sayı kesme noktası, ön-sayfa ağırlıklı içerik,
-- sadece-kazanım-listesi) kontrol edip virgülle ayrılmış bir etiket listesi
-- olarak bu kolona yazıyor (ör. "suspicious_cutoff,front_matter_heavy").
-- NULL = temiz, hiçbir sinyal tetiklenmedi.
--
-- Bu bir ENGELLEME değil, sadece bir İŞARETLEME — admin panelinde bir rozet
-- olarak gösterilir, silme/düzeltme kararı admin'e kalır.

ALTER TABLE meb_resources
  ADD COLUMN IF NOT EXISTS health_flag TEXT;

COMMENT ON COLUMN meb_resources.health_flag IS
  'Yükleme sırasında runHealthCheck() tarafından tespit edilen şüpheli sinyaller, virgülle ayrılmış (suspicious_cutoff, front_matter_heavy, kazanim_listesi_only). NULL = temiz.';
