-- 028_harden_ai_usage_and_reconcile_schema.sql
-- Güvenlik, canlı şema drift'i ve AI pilot ölçümü için idempotent uzlaştırma.

ALTER TABLE public.profiles ALTER COLUMN plan SET DEFAULT 'none'::text;

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS gen_engine text,
  ADD COLUMN IF NOT EXISTS gen_request_id uuid,
  ADD COLUMN IF NOT EXISTS gen_experiment text,
  ADD COLUMN IF NOT EXISTS gen_experiment_variant text,
  ADD COLUMN IF NOT EXISTS gen_experiment_bucket smallint;

ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS pricing_version text;

CREATE INDEX IF NOT EXISTS idx_ai_usage_request
  ON public.ai_usage_logs (request_id) WHERE request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_gen_experiment
  ON public.quiz_sessions (gen_experiment, gen_experiment_variant, created_at DESC)
  WHERE gen_experiment IS NOT NULL;

-- View sahibinin yetkileriyle çalışmasını engeller; ayrıca API rollerinden tüm
-- doğrudan ayrıcalıkları kaldırır. Erişim yalnızca server-side service_role ile.
ALTER VIEW public.ai_usage_daily_summary SET (security_invoker = true);
REVOKE ALL ON TABLE public.ai_usage_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ai_usage_daily_summary FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ai_usage_logs TO service_role;
GRANT SELECT ON TABLE public.ai_usage_daily_summary TO service_role;

