-- Point-in-time, PII-free snapshots for measuring predictive risk quality.
CREATE TABLE IF NOT EXISTS public.learning_risk_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT 'Genel',
  topic text NOT NULL,
  risk_score integer NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high')),
  mastery numeric(5,2) NOT NULL,
  retention numeric(5,2) NOT NULL,
  confidence numeric(5,4) NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  observed_day date GENERATED ALWAYS AS ((observed_at AT TIME ZONE 'UTC')::date) STORED,
  UNIQUE(student_id, subject, topic, observed_day)
);
CREATE INDEX IF NOT EXISTS learning_risk_snapshots_observed_idx ON public.learning_risk_snapshots(observed_at DESC, risk_level);
ALTER TABLE public.learning_risk_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_risk_snapshots FROM anon, authenticated;
GRANT ALL ON public.learning_risk_snapshots TO service_role;
COMMENT ON TABLE public.learning_risk_snapshots IS 'Daily point-in-time predictive risk observations for calibration; no PII beyond student UUID.';
