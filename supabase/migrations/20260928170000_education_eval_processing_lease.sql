-- Prevent a retried browser request from charging for the same blind case twice.
ALTER TABLE public.education_eval_runs
  ADD COLUMN IF NOT EXISTS processing_token uuid,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;
