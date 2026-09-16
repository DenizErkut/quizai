CREATE TABLE IF NOT EXISTS public.adaptive_teacher_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  subject text NOT NULL, topic text NOT NULL, subject_key text NOT NULL, topic_key text NOT NULL,
  mode text NOT NULL CHECK(mode IN ('standard')), reason text NOT NULL DEFAULT 'Öğretmen manuel müdahalesi',
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 days'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(teacher_id,student_id,subject_key,topic_key)
);
CREATE INDEX IF NOT EXISTS adaptive_teacher_overrides_student_idx ON public.adaptive_teacher_overrides(student_id,topic_key,expires_at DESC);
ALTER TABLE public.adaptive_teacher_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adaptive_teacher_overrides FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.adaptive_teacher_overrides TO service_role;
COMMENT ON TABLE public.adaptive_teacher_overrides IS 'Time-bounded teacher intervention; only standard-mode suppression is allowed, never forced AI adaptation.';
