ALTER TABLE meb_resources
  ADD COLUMN IF NOT EXISTS health_flag TEXT;

COMMENT ON COLUMN meb_resources.health_flag IS
  'Yükleme sırasında runHealthCheck() tarafından tespit edilen şüpheli sinyaller, virgülle ayrılmış (suspicious_cutoff, front_matter_heavy, kazanim_listesi_only). NULL = temiz.';
