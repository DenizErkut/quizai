-- Keep daily nudge discovery bounded and resumable across cron invocations.
CREATE TABLE IF NOT EXISTS public.coach_nudge_enqueue_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  run_date date NOT NULL,
  last_user_id uuid,
  complete boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.coach_nudge_enqueue_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coach_nudge_enqueue_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coach_nudge_enqueue_state TO service_role;
CREATE POLICY internal_service_only ON public.coach_nudge_enqueue_state
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.enqueue_coach_nudge_jobs(p_batch_size integer DEFAULT 500)
RETURNS TABLE(batch_candidates integer, queued integer, complete boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_today date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_cursor uuid;
  v_complete boolean;
  v_ids uuid[];
  v_candidates integer;
  v_queued integer;
  v_limit integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 1000);
BEGIN
  INSERT INTO public.coach_nudge_enqueue_state(singleton, run_date)
  VALUES (true, v_today)
  ON CONFLICT (singleton) DO NOTHING;

  SELECT s.last_user_id, s.complete
    INTO v_cursor, v_complete
    FROM public.coach_nudge_enqueue_state AS s
   WHERE s.singleton = true
   FOR UPDATE;

  IF NOT FOUND OR (SELECT run_date FROM public.coach_nudge_enqueue_state WHERE singleton = true) <> v_today THEN
    UPDATE public.coach_nudge_enqueue_state
       SET run_date = v_today, last_user_id = NULL, complete = false, updated_at = pg_catalog.now()
     WHERE singleton = true;
    v_cursor := NULL;
    v_complete := false;
  END IF;

  IF v_complete THEN
    RETURN QUERY SELECT 0, 0, true;
    RETURN;
  END IF;

  SELECT pg_catalog.array_agg(batch.id ORDER BY batch.id), pg_catalog.count(*)::integer
    INTO v_ids, v_candidates
    FROM (
      SELECT p.id
        FROM public.profiles AS p
       WHERE p.plan IN ('silver', 'premium', 'unlimited')
         AND (v_cursor IS NULL OR p.id > v_cursor)
         AND EXISTS (
           SELECT 1 FROM public.quiz_sessions AS qs
            WHERE qs.user_id = p.id AND qs.completed = true
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.notification_preferences AS np
            WHERE np.user_id = p.id AND np.coach_nudge = false
         )
       ORDER BY p.id
       LIMIT v_limit
    ) AS batch;

  IF COALESCE(v_candidates, 0) = 0 THEN
    UPDATE public.coach_nudge_enqueue_state
       SET complete = true, updated_at = pg_catalog.now()
     WHERE singleton = true;
    RETURN QUERY SELECT 0, 0, true;
    RETURN;
  END IF;

  INSERT INTO public.coach_nudge_jobs(user_id, scheduled_for)
  SELECT candidate_id, v_today
    FROM pg_catalog.unnest(v_ids) AS candidates(candidate_id)
  ON CONFLICT (user_id, scheduled_for) DO NOTHING;
  GET DIAGNOSTICS v_queued = ROW_COUNT;

  UPDATE public.coach_nudge_enqueue_state
     SET last_user_id = v_ids[pg_catalog.array_length(v_ids, 1)],
         complete = v_candidates < v_limit,
         updated_at = pg_catalog.now()
   WHERE singleton = true;

  RETURN QUERY SELECT v_candidates, v_queued, v_candidates < v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_coach_nudge_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_coach_nudge_jobs(integer) TO service_role;

-- Recover leases after a crashed/expired worker; SKIP LOCKED still ensures a
-- job is owned by only one live worker. Exhausted stale leases become failed.
CREATE INDEX IF NOT EXISTS coach_nudge_jobs_expired_lease_idx
  ON public.coach_nudge_jobs(locked_at)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION public.claim_coach_nudge_jobs(p_limit integer, p_worker_id uuid)
RETURNS SETOF public.coach_nudge_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.coach_nudge_jobs
     SET status = 'failed', locked_at = NULL, worker_id = NULL,
         last_error = COALESCE(last_error, 'worker_lease_expired_max_attempts'), updated_at = pg_catalog.now()
   WHERE status = 'processing'
     AND (locked_at IS NULL OR locked_at < pg_catalog.now() - interval '5 minutes')
     AND attempts >= 3;

  UPDATE public.coach_nudge_jobs
     SET status = 'pending', locked_at = NULL, worker_id = NULL,
         available_at = pg_catalog.now(), last_error = COALESCE(last_error, 'worker_lease_expired_retrying'), updated_at = pg_catalog.now()
   WHERE status = 'processing'
     AND (locked_at IS NULL OR locked_at < pg_catalog.now() - interval '5 minutes')
     AND attempts < 3;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
      FROM public.coach_nudge_jobs AS j
     WHERE j.status = 'pending' AND j.available_at <= pg_catalog.now()
     ORDER BY j.available_at, j.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 20)
  )
  UPDATE public.coach_nudge_jobs AS j
     SET status = 'processing', attempts = j.attempts + 1,
         locked_at = pg_catalog.now(), worker_id = p_worker_id, updated_at = pg_catalog.now()
    FROM picked
   WHERE j.id = picked.id
  RETURNING j.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_coach_nudge_jobs(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_coach_nudge_jobs(integer, uuid) TO service_role;

-- Advisor-confirmed: index the new FK and remove its identical redundant unique
-- index (the referrals_referred_id_key constraint remains the uniqueness guard).
CREATE INDEX IF NOT EXISTS referrals_qualified_subscription_id_idx
  ON public.referrals(qualified_subscription_id);
DROP INDEX IF EXISTS public.referrals_one_referrer_per_referred_uidx;
