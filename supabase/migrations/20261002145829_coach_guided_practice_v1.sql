-- A measured, answer-hidden guided practice step between baseline and post.
CREATE TABLE IF NOT EXISTS public.coach_guided_practice_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.verified_learning_cycles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question jsonb NOT NULL CHECK (jsonb_typeof(question) = 'object'),
  status text NOT NULL DEFAULT 'awaiting_first' CHECK (status IN ('awaiting_first', 'awaiting_hint', 'awaiting_retry', 'awaiting_explanation', 'processing', 'completed')),
  first_choice integer,
  retry_choice integer,
  hint_count integer NOT NULL DEFAULT 0 CHECK (hint_count BETWEEN 0 AND 2),
  student_explanation text,
  quiz_session_id uuid REFERENCES public.quiz_sessions(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT coach_guided_practice_cycle_unique UNIQUE (cycle_id)
);
CREATE INDEX IF NOT EXISTS coach_guided_practice_student_idx
  ON public.coach_guided_practice_attempts (student_id, started_at DESC);
ALTER TABLE public.coach_guided_practice_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_guided_practice_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coach_guided_practice_attempts TO service_role;
