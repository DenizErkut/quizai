-- Teacher-reviewed, paired learning-gain pilot. Descriptive, not causal.
CREATE TABLE IF NOT EXISTS public.learning_gain_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  learning_objective_id uuid NOT NULL REFERENCES public.learning_objective_catalog(id),
  pre_session_id uuid NOT NULL REFERENCES public.quiz_sessions(id),
  post_session_id uuid NOT NULL REFERENCES public.quiz_sessions(id),
  transfer_session_id uuid REFERENCES public.quiz_sessions(id),
  pre_score_pct numeric(5,2) NOT NULL CHECK (pre_score_pct BETWEEN 0 AND 100),
  post_score_pct numeric(5,2) NOT NULL CHECK (post_score_pct BETWEEN 0 AND 100),
  gain_pp numeric(6,2) NOT NULL CHECK (gain_pp BETWEEN -100 AND 100),
  transfer_score_pct numeric(5,2) CHECK (transfer_score_pct BETWEEN 0 AND 100),
  transfer_gain_pp numeric(6,2) CHECK (transfer_gain_pp BETWEEN -100 AND 100),
  item_count integer NOT NULL CHECK (item_count >= 5),
  pre_completed_at timestamptz NOT NULL,
  post_completed_at timestamptz NOT NULL,
  transfer_completed_at timestamptz,
  reviewed_by uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  transfer_reviewed_by uuid REFERENCES auth.users(id),
  transfer_reviewed_at timestamptz,
  measurement_version text NOT NULL DEFAULT 'learning-gain-v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_gain_distinct_sessions CHECK (pre_session_id <> post_session_id),
  CONSTRAINT learning_gain_distinct_transfer CHECK (transfer_session_id IS NULL OR transfer_session_id NOT IN (pre_session_id, post_session_id)),
  CONSTRAINT learning_gain_time_order CHECK (pre_completed_at < post_completed_at),
  CONSTRAINT learning_gain_transfer_complete CHECK (
    (transfer_session_id IS NULL AND transfer_score_pct IS NULL AND transfer_gain_pp IS NULL AND transfer_completed_at IS NULL AND transfer_reviewed_by IS NULL AND transfer_reviewed_at IS NULL)
    OR (transfer_session_id IS NOT NULL AND transfer_score_pct IS NOT NULL AND transfer_gain_pp IS NOT NULL AND transfer_completed_at > post_completed_at AND transfer_reviewed_by IS NOT NULL AND transfer_reviewed_at IS NOT NULL)
  ),
  CONSTRAINT learning_gain_pair_unique UNIQUE (teacher_id, student_id, pre_session_id, post_session_id)
);

CREATE INDEX IF NOT EXISTS learning_gain_measurements_teacher_class_idx
  ON public.learning_gain_measurements (teacher_id, classroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS learning_gain_measurements_objective_idx
  ON public.learning_gain_measurements (learning_objective_id, created_at DESC);
CREATE INDEX IF NOT EXISTS learning_gain_measurements_student_idx
  ON public.learning_gain_measurements (student_id, post_completed_at DESC);

ALTER TABLE public.learning_gain_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_gain_measurements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_gain_measurements TO service_role;
