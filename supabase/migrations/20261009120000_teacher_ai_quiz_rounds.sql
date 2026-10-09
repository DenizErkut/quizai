-- Periodic teacher AI-literacy rounds (every 10 days, difficulty rises with each pass).
CREATE TABLE IF NOT EXISTS public.teacher_ai_quiz_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_no integer NOT NULL CHECK (round_no > 0),
  level integer NOT NULL CHECK (level BETWEEN 1 AND 3),
  questions jsonb NOT NULL,
  answers jsonb,
  score integer CHECK (score BETWEEN 0 AND 4),
  passed boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  UNIQUE (user_id, round_no)
);
CREATE INDEX IF NOT EXISTS teacher_ai_quiz_rounds_user_idx ON public.teacher_ai_quiz_rounds (user_id, submitted_at DESC);
ALTER TABLE public.teacher_ai_quiz_rounds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_ai_quiz_rounds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_ai_quiz_rounds TO service_role;
