-- Teacher-assigned, evidence-grade test cycles. Answer keys remain in private
-- service-role tables until a phase is submitted and scored on the server.
CREATE TABLE IF NOT EXISTS public.verified_learning_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_objective_id uuid NOT NULL REFERENCES public.learning_objective_catalog(id),
  item_sets jsonb NOT NULL CHECK (jsonb_typeof(item_sets) = 'object'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS verified_learning_cycles_active_unique
  ON public.verified_learning_cycles (teacher_id, student_id, learning_objective_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS verified_learning_cycles_student_idx
  ON public.verified_learning_cycles (student_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS verified_learning_cycles_teacher_idx
  ON public.verified_learning_cycles (teacher_id, classroom_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.verified_learning_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.verified_learning_cycles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('baseline', 'post', 'transfer')),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'processing', 'completed')),
  questions jsonb NOT NULL CHECK (jsonb_typeof(questions) = 'array'),
  answers jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(answers) = 'array'),
  score_pct numeric(5,2) CHECK (score_pct BETWEEN 0 AND 100),
  quiz_session_id uuid REFERENCES public.quiz_sessions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT verified_learning_attempt_stage_unique UNIQUE (cycle_id, stage)
);
CREATE INDEX IF NOT EXISTS verified_learning_attempts_student_idx
  ON public.verified_learning_attempts (student_id, started_at DESC);

ALTER TABLE public.verified_learning_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verified_learning_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verified_learning_cycles, public.verified_learning_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.verified_learning_cycles, public.verified_learning_attempts TO service_role;
