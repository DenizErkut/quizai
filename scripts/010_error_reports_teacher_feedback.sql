-- scripts/010_error_reports_teacher_feedback.sql
--
-- 18 Ağustos 2026 — Madde 2 (pratium-bekleyen-isler-uygulama-plani.md):
-- Öğretmen geri bildirim döngüsünün resmileştirilmesi. Önceden error_reports
-- sadece öğrenci bildirimlerine (components/QuizResult.tsx) yapılandırılmıştı
-- ve kimseye "bildirdiğin düzeltildi" geri bildirimi hiç dönmüyordu.

ALTER TABLE error_reports
  ADD COLUMN IF NOT EXISTS root_cause TEXT,
  ADD COLUMN IF NOT EXISTS reporter_role TEXT;

COMMENT ON COLUMN error_reports.root_cause IS
  'Admin''in yazdığı yapılandırılmış kök neden özeti — admin_note''tan (serbest metin) AYRI, kısa/net bir özet. Raporu açan kullanıcıya "Bildirdiklerim" ekranında gösterilir.';
COMMENT ON COLUMN error_reports.reporter_role IS
  'student | teacher | NULL (system_scan kaynaklı ya da bu kolon eklenmeden önceki eski kayıtlar).';

-- Kullanıcının (öğrenci/öğretmen) kendi bildirdiği satırları görebilmesi
-- için ("Bildirdiklerim" ekranı, components/ContentIssueReporter.tsx).
-- Var olan diğer SELECT politikalarıyla ÇAKIŞMAZ (Postgres RLS politikaları
-- aynı işlem için OR'lanır) — sadece "kendi satırın" için ek bir izin yolu.
DROP POLICY IF EXISTS "error_reports_select_own" ON error_reports;
CREATE POLICY "error_reports_select_own" ON error_reports
  FOR SELECT
  USING (auth.uid() = user_id);
