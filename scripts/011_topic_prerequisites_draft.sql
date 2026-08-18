-- scripts/011_topic_prerequisites_draft.sql
--
-- 18 Ağustos 2026 — Madde 3 (pratium-bekleyen-isler-uygulama-plani.md):
-- Kazanım-taksonomisi (Faz 10 Learning Graph) yarı-otomatik pipeline.
--
-- lib/learning-graph.ts bugüne kadar SADECE elle doldurulmuş, Kesirler/
-- Ondalık Sayılar konularıyla sınırlı bir topic_prerequisites tablosuna
-- dayanıyordu (proof-of-concept, dosyanın kendi başlık yorumunda açıkça
-- belirtiliyor). Bu migration, AI'ın önerdiği ama bir admin'in ONAYLAMADAN
-- gerçek topic_prerequisites tablosuna asla yazılmayacağı bir "taslak"
-- (draft) katmanı ekliyor — yanlış/düşük kaliteli önerilerin öğrenme
-- grafiğini sessizce bozmasını engellemek için.
CREATE TABLE IF NOT EXISTS topic_prerequisites_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  grade INTEGER NOT NULL,
  level TEXT, -- curriculum tablosundaki 'level' alanıyla eşleşir (varsa)
  topic TEXT NOT NULL,
  prerequisite_topic TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high' (AI'ın kendi beyanı)
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_topic_prereq_draft_status
  ON topic_prerequisites_draft(status);
CREATE INDEX IF NOT EXISTS idx_topic_prereq_draft_subject_grade
  ON topic_prerequisites_draft(subject, grade);

ALTER TABLE topic_prerequisites_draft ENABLE ROW LEVEL SECURITY;

-- Sadece admin rolündeki kullanıcılar taslakları görebilir/yönetebilir.
-- Not: Bu proje admin yetkisini API route seviyesinde (service-role client
-- ile) kontrol ediyor; bu RLS politikası ek bir güvenlik katmanı olarak
-- duruyor, service-role çağrıları zaten RLS'i bypass eder.
DROP POLICY IF EXISTS topic_prereq_draft_admin_all ON topic_prerequisites_draft;
CREATE POLICY topic_prereq_draft_admin_all ON topic_prerequisites_draft
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

COMMENT ON TABLE topic_prerequisites_draft IS
  'Madde 3: AI tarafından önerilen kazanım-önkoşul ilişkileri. Bir admin
   onaylayana kadar gerçek topic_prerequisites tablosuna hiçbir satır
   yazılmaz.';
