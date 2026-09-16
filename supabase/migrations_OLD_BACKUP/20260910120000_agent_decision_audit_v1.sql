-- Append-only, service-role-only audit trail for bounded agents.
CREATE TABLE IF NOT EXISTS public.agent_decision_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  policy_version text NOT NULL,
  input_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_decision_audit_actor_idx
  ON public.agent_decision_audit(actor_id, created_at DESC);

ALTER TABLE public.agent_decision_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_decision_audit FROM anon, authenticated;
GRANT ALL ON public.agent_decision_audit TO service_role;

COMMENT ON TABLE public.agent_decision_audit IS
  'Append-only, service-role-only evidence for bounded agent decisions; excludes raw AI output.';
