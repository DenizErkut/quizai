CREATE TABLE IF NOT EXISTS topic_prerequisites_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  grade INTEGER NOT NULL,
  level TEXT,
  topic TEXT NOT NULL,
  prerequisite_topic TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'medium',
  rationale TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_topic_prereq_draft_status
  ON topic_prerequisites_draft(status);
CREATE INDEX IF NOT EXISTS idx_topic_prereq_draft_subject_grade
  ON topic_prerequisites_draft(subject, grade);

ALTER TABLE topic_prerequisites_draft ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topic_prereq_draft_admin_all ON topic_prerequisites_draft;
CREATE POLICY topic_prereq_draft_admin_all ON topic_prerequisites_draft
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

COMMENT ON TABLE topic_prerequisites_draft IS
  'Madde 3: AI tarafından önerilen kazanım-önkoşul ilişkileri. Bir admin onaylayana kadar gerçek topic_prerequisites tablosuna hiçbir satır yazılmaz.';
