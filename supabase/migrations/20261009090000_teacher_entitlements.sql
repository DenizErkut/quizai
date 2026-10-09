-- Teacher memberships: limited tier by default; full access via paid plan, institution, or an
-- earned/grandfathered grant. Usage events back the free-tier quotas.
CREATE TABLE IF NOT EXISTS public.teacher_entitlements (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('invite_gold_10', 'grandfather', 'admin')),
  qualifying_students integer NOT NULL DEFAULT 0,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS public.teacher_usage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ai_generation', 'live_quiz')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS teacher_usage_events_user_kind_idx ON public.teacher_usage_events (user_id, kind, created_at DESC);

ALTER TABLE public.teacher_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_entitlements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teacher_usage_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_entitlements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_usage_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.teacher_usage_events_id_seq TO service_role;

-- Existing teachers keep full access for a grace period; usage already made is not counted.
INSERT INTO public.teacher_entitlements (user_id, source, expires_at)
SELECT t.user_id, 'grandfather', now() + interval '30 days'
FROM public.teachers t
WHERE t.user_id IS NOT NULL AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)
ON CONFLICT (user_id) DO NOTHING;
