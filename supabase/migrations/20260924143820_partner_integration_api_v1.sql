-- External CRM/ERP credentials are server-only. No browser role receives table access.
-- Applied on the production project as migration 20260924143820.
CREATE TABLE IF NOT EXISTS public.partner_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 100),
  token_hash text NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  pseudonym_key text NOT NULL CHECK (char_length(pseudonym_key) = 64),
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT partner_integrations_v1_scopes CHECK (
    scopes <@ ARRAY['institution:read', 'students:read:pseudonymous']::text[]
  )
);

CREATE INDEX IF NOT EXISTS partner_integrations_active_lookup
  ON public.partner_integrations (token_hash)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.partner_integration_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  integration_id uuid NOT NULL REFERENCES public.partner_integrations(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 100),
  endpoint text NOT NULL CHECK (char_length(endpoint) BETWEEN 1 AND 200),
  status_code integer NOT NULL CHECK (status_code BETWEEN 100 AND 599),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_integration_audit_tenant_time
  ON public.partner_integration_audit (institution_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_integration_rate_limits (
  integration_id uuid PRIMARY KEY REFERENCES public.partner_integrations(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);

ALTER TABLE public.partner_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_integration_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_integration_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.partner_integrations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.partner_integration_audit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.partner_integration_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_integrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_integration_audit TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_integration_rate_limits TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.partner_integration_audit_id_seq TO service_role;

-- Atomic rolling-window counter. Invoker rights; callable only with server service_role.
CREATE OR REPLACE FUNCTION public.consume_partner_integration_rate_limit(
  p_integration_id uuid,
  p_window_start timestamptz
)
RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.partner_integration_rate_limits (integration_id, window_start, request_count)
  VALUES (p_integration_id, p_window_start, 1)
  ON CONFLICT (integration_id)
  DO UPDATE SET
    window_start = EXCLUDED.window_start,
    request_count = CASE
      WHEN public.partner_integration_rate_limits.window_start = EXCLUDED.window_start
        THEN public.partner_integration_rate_limits.request_count + 1
      ELSE 1
    END
  RETURNING request_count;
$$;

REVOKE ALL ON FUNCTION public.consume_partner_integration_rate_limit(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_partner_integration_rate_limit(uuid, timestamptz) TO service_role;

