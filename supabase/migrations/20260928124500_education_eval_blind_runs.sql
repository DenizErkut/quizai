-- Education Eval model runs: outputs are private admin data and contain no
-- learner submissions. Model labels remain blinded until every output is rated.

CREATE TABLE IF NOT EXISTS public.education_eval_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_set_id uuid NOT NULL REFERENCES public.education_eval_benchmark_sets(id) ON DELETE RESTRICT,
  benchmark_version integer NOT NULL CHECK (benchmark_version > 0),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  blind_mapping jsonb NOT NULL CHECK (jsonb_typeof(blind_mapping) = 'object'),
  total_items integer NOT NULL DEFAULT 50 CHECK (total_items = 50),
  completed_items integer NOT NULL DEFAULT 0 CHECK (completed_items BETWEEN 0 AND total_items),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.education_eval_run_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.education_eval_runs(id) ON DELETE CASCADE,
  benchmark_item_id uuid NOT NULL REFERENCES public.education_eval_benchmark_items(id) ON DELETE RESTRICT,
  provider_key text NOT NULL CHECK (provider_key IN ('openai', 'anthropic', 'mistral')),
  blind_label text NOT NULL CHECK (blind_label IN ('A', 'B', 'C')),
  model text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'error')),
  answer_index integer,
  is_correct boolean NOT NULL DEFAULT false,
  explanation text NOT NULL DEFAULT '',
  error_code text,
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd numeric(12, 8) NOT NULL DEFAULT 0 CHECK (cost_usd >= 0),
  curriculum_alignment_score smallint CHECK (curriculum_alignment_score BETWEEN 1 AND 5),
  pedagogy_score smallint CHECK (pedagogy_score BETWEEN 1 AND 5),
  age_appropriateness_score smallint CHECK (age_appropriateness_score BETWEEN 1 AND 5),
  safety_score smallint CHECK (safety_score BETWEEN 1 AND 5),
  reviewer_notes text NOT NULL DEFAULT '',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, benchmark_item_id, provider_key),
  UNIQUE (run_id, benchmark_item_id, blind_label)
);

CREATE INDEX IF NOT EXISTS education_eval_runs_recent_idx
  ON public.education_eval_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS education_eval_run_results_run_idx
  ON public.education_eval_run_results (run_id, benchmark_item_id, blind_label);

ALTER TABLE public.education_eval_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_eval_run_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.education_eval_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.education_eval_run_results FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.education_eval_runs TO service_role;
GRANT ALL ON public.education_eval_run_results TO service_role;

COMMENT ON TABLE public.education_eval_runs IS
  'Blind, version-pinned model evaluations over the 50-question verified MEB benchmark.';
COMMENT ON TABLE public.education_eval_run_results IS
  'Private model answers with automatic correctness, latency and cost plus separate human rubric scores.';
