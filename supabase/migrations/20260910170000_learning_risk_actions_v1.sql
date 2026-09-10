-- Teacher action trail for predictive-learning early warnings.
CREATE TABLE IF NOT EXISTS public.learning_risk_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,
  subject text NOT NULL DEFAULT 'Genel',
  topic text NOT NULL,
  action text NOT NULL CHECK (action IN ('acknowledge','assign','notify','resolve')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS learning_risk_actions_teacher_idx ON public.learning_risk_actions(teacher_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS learning_risk_actions_student_topic_idx ON public.learning_risk_actions(student_id, topic, status);
ALTER TABLE public.learning_risk_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_risk_actions FROM anon, authenticated;
GRANT ALL ON public.learning_risk_actions TO service_role;
COMMENT ON TABLE public.learning_risk_actions IS 'Teacher actions taken on predictive learning risk warnings; service-role API only.';
