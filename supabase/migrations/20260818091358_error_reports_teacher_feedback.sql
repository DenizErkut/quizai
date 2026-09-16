ALTER TABLE error_reports
  ADD COLUMN IF NOT EXISTS root_cause TEXT,
  ADD COLUMN IF NOT EXISTS reporter_role TEXT;

COMMENT ON COLUMN error_reports.root_cause IS
  'Admin''in yazdığı yapılandırılmış kök neden özeti — admin_note''tan (serbest metin) AYRI, kısa/net bir özet. Raporu açan kullanıcıya "Bildirdiklerim" ekranında gösterilir.';
COMMENT ON COLUMN error_reports.reporter_role IS
  'student | teacher | NULL (system_scan kaynaklı ya da bu kolon eklenmeden önceki eski kayıtlar).';

DROP POLICY IF EXISTS "error_reports_select_own" ON error_reports;
CREATE POLICY "error_reports_select_own" ON error_reports
  FOR SELECT
  USING (auth.uid() = user_id);
