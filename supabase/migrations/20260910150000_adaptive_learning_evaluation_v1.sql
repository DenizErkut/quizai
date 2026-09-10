CREATE TABLE IF NOT EXISTS public.adaptive_learning_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cohort text NOT NULL CHECK (cohort IN ('adaptive','standard')),
  baseline_mastery numeric(5,2),
  followup_mastery numeric(5,2),
  baseline_retention numeric(5,2),
  followup_retention numeric(5,2),
  baseline_pct numeric(5,2),
  followup_pct numeric(5,2),
  observation_started_at timestamptz NOT NULL DEFAULT now(),
  observation_ended_at timestamptz,
  sample_version text NOT NULL DEFAULT 'adaptive-learning-v3-pilot',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, sample_version)
);
CREATE INDEX IF NOT EXISTS adaptive_learning_evaluations_cohort_idx ON public.adaptive_learning_evaluations(cohort, created_at DESC);
ALTER TABLE public.adaptive_learning_evaluations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adaptive_learning_evaluations FROM anon, authenticated;
GRANT ALL ON public.adaptive_learning_evaluations TO service_role;
COMMENT ON TABLE public.adaptive_learning_evaluations IS 'Controlled adaptive vs standard learning gain evaluation; service-role only.';
