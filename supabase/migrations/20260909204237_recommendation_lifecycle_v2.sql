-- Recommendation Engine v2: durable student decision lifecycle.

ALTER TABLE public.student_recommendations
  DROP CONSTRAINT IF EXISTS student_recommendations_status_check;

ALTER TABLE public.student_recommendations
  ADD CONSTRAINT student_recommendations_status_check
  CHECK (status IN ('active', 'accepted', 'deferred', 'completed', 'dismissed', 'superseded'));

ALTER TABLE public.student_recommendations
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS deferred_until timestamptz,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_status_reason text;

CREATE TABLE IF NOT EXISTS public.recommendation_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES public.student_recommendations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  reason text,
  deferred_until timestamptz,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('student', 'teacher', 'admin', 'system')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recommendation_lifecycle_student_time_idx
  ON public.recommendation_lifecycle_events (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS recommendation_lifecycle_recommendation_time_idx
  ON public.recommendation_lifecycle_events (recommendation_id, created_at DESC);

ALTER TABLE public.recommendation_lifecycle_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recommendation_lifecycle_select_own ON public.recommendation_lifecycle_events;
CREATE POLICY recommendation_lifecycle_select_own
  ON public.recommendation_lifecycle_events FOR SELECT TO authenticated
  USING ((select auth.uid()) = student_id);

REVOKE INSERT, UPDATE, DELETE ON public.recommendation_lifecycle_events FROM anon, authenticated;
GRANT SELECT ON public.recommendation_lifecycle_events TO authenticated;
GRANT ALL ON public.recommendation_lifecycle_events TO service_role;

CREATE OR REPLACE FUNCTION public.audit_recommendation_status_change_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.recommendation_lifecycle_events (
      recommendation_id, student_id, previous_status, new_status, reason,
      deferred_until, actor_type, actor_id, metadata
    ) VALUES (
      NEW.id, NEW.student_id, OLD.status, NEW.status, NEW.last_status_reason,
      NEW.deferred_until,
      coalesce(nullif(current_setting('app.recommendation_actor_type', true), ''), 'system'),
      nullif(current_setting('app.recommendation_actor_id', true), '')::uuid,
      '{}'::jsonb
    );
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS recommendation_status_audit_v2 ON public.student_recommendations;
CREATE TRIGGER recommendation_status_audit_v2
AFTER UPDATE OF status ON public.student_recommendations
FOR EACH ROW EXECUTE FUNCTION public.audit_recommendation_status_change_v2();

CREATE OR REPLACE FUNCTION public.transition_student_recommendation_v2(
  p_recommendation_id uuid,
  p_student_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_deferred_until timestamptz DEFAULT NULL
) RETURNS public.student_recommendations
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.student_recommendations;
  v_target_status text;
BEGIN
  SELECT * INTO v_row
  FROM public.student_recommendations
  WHERE id = p_recommendation_id AND student_id = p_student_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'recommendation_not_found'; END IF;

  v_target_status := CASE p_action
    WHEN 'accept' THEN 'accepted'
    WHEN 'defer' THEN 'deferred'
    WHEN 'dismiss' THEN 'dismissed'
    WHEN 'complete' THEN 'completed'
    WHEN 'resume' THEN 'active'
    ELSE NULL END;
  IF v_target_status IS NULL THEN RAISE EXCEPTION 'invalid_recommendation_action'; END IF;

  IF v_row.status IN ('completed', 'dismissed', 'superseded') THEN
    RAISE EXCEPTION 'terminal_recommendation';
  END IF;
  IF p_action = 'resume' AND v_row.status <> 'deferred' THEN
    RAISE EXCEPTION 'only_deferred_recommendations_can_resume';
  END IF;
  IF p_action = 'defer' AND (
    p_deferred_until IS NULL OR p_deferred_until <= now()
    OR p_deferred_until > now() + interval '30 days'
  ) THEN RAISE EXCEPTION 'invalid_deferred_until'; END IF;

  PERFORM set_config('app.recommendation_actor_type', 'student', true);
  PERFORM set_config('app.recommendation_actor_id', p_student_id::text, true);

  UPDATE public.student_recommendations SET
    status = v_target_status,
    accepted_at = CASE WHEN p_action = 'accept' THEN coalesce(accepted_at, now()) ELSE accepted_at END,
    deferred_at = CASE WHEN p_action = 'defer' THEN now() ELSE deferred_at END,
    deferred_until = CASE WHEN p_action = 'defer' THEN p_deferred_until WHEN p_action = 'resume' THEN NULL ELSE deferred_until END,
    dismissed_at = CASE WHEN p_action = 'dismiss' THEN now() ELSE dismissed_at END,
    completed_at = CASE WHEN p_action = 'complete' THEN now() ELSE completed_at END,
    status_updated_at = now(),
    last_status_reason = nullif(btrim(p_reason), '')
  WHERE id = p_recommendation_id
  RETURNING * INTO v_row;
  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.transition_student_recommendation_v2(uuid, uuid, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_student_recommendation_v2(uuid, uuid, text, text, timestamptz)
  TO service_role;

-- Keep explicit student decisions when the engine refreshes its active candidates.
ALTER FUNCTION public.refresh_student_recommendations(uuid)
  RENAME TO refresh_student_recommendations_v1_internal;

CREATE OR REPLACE FUNCTION public.refresh_student_recommendations(p_student_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_inserted integer := 0;
BEGIN
  UPDATE public.student_recommendations
  SET status = 'superseded', status_updated_at = now(),
      last_status_reason = 'DEFER_PERIOD_ENDED'
  WHERE student_id = p_student_id AND status = 'deferred'
    AND deferred_until <= now();

  v_inserted := public.refresh_student_recommendations_v1_internal(p_student_id);

  UPDATE public.student_recommendations fresh
  SET status = 'superseded', status_updated_at = now(),
      last_status_reason = 'PRESERVED_STUDENT_DECISION'
  WHERE fresh.student_id = p_student_id AND fresh.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.student_recommendations kept
      WHERE kept.student_id = fresh.student_id AND kept.id <> fresh.id
        AND kept.status IN ('accepted', 'deferred')
        AND lower(kept.subject) = lower(fresh.subject)
        AND lower(kept.topic) = lower(fresh.topic)
        AND kept.action_type = fresh.action_type
        AND (kept.status = 'accepted' OR kept.deferred_until > now())
    );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN (
    SELECT count(*)::integer FROM public.student_recommendations
    WHERE student_id = p_student_id AND status = 'active'
      AND generated_at >= transaction_timestamp()
  );
END; $$;

REVOKE ALL ON FUNCTION public.refresh_student_recommendations(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_recommendations(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.refresh_student_recommendations_v1_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_recommendations_v1_internal(uuid) TO service_role;

COMMENT ON TABLE public.recommendation_lifecycle_events IS
  'Append-only audit trail for Recommendation Engine v2 student and system status transitions.';
COMMENT ON FUNCTION public.transition_student_recommendation_v2(uuid, uuid, text, text, timestamptz) IS
  'Service-only validated lifecycle transition; the API derives student_id from the verified session.';
