-- Retention calibration v1
-- Compares time-decayed expected recall with observed repeat-quiz success.

CREATE TABLE IF NOT EXISTS public.retention_calibration_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  subject text NOT NULL,
  topic text NOT NULL,
  previous_practiced_at timestamptz,
  repeated_at timestamptz NOT NULL,
  repeat_interval_days numeric(10,3),
  prior_event_count integer NOT NULL DEFAULT 0 CHECK (prior_event_count >= 0),
  prior_mastery numeric(5,2) NOT NULL CHECK (prior_mastery BETWEEN 0 AND 100),
  decay_constant_days numeric(6,2) NOT NULL CHECK (decay_constant_days > 0),
  predicted_retention numeric(5,2) NOT NULL CHECK (predicted_retention BETWEEN 0 AND 100),
  predicted_recall_pct numeric(5,2) NOT NULL CHECK (predicted_recall_pct BETWEEN 0 AND 100),
  actual_score_pct numeric(5,2) NOT NULL CHECK (actual_score_pct BETWEEN 0 AND 100),
  signed_error numeric(6,2) NOT NULL,
  absolute_error numeric(5,2) NOT NULL CHECK (absolute_error BETWEEN 0 AND 100),
  squared_error numeric(10,4) NOT NULL CHECK (squared_error >= 0),
  interval_bucket text NOT NULL CHECK (interval_bucket IN ('same_day', '1_6_days', '7_13_days', '14_29_days', '30_plus_days')),
  is_eligible boolean NOT NULL DEFAULT false,
  algorithm_version text NOT NULL DEFAULT 'retention-v1',
  measurement_version text NOT NULL DEFAULT 'retention-calibration-v1',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT retention_calibration_session_dimension_unique
    UNIQUE (quiz_session_id, subject, topic, algorithm_version)
);

CREATE INDEX IF NOT EXISTS retention_calibration_subject_interval_idx
  ON public.retention_calibration_measurements (subject, interval_bucket, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS retention_calibration_eligible_time_idx
  ON public.retention_calibration_measurements (is_eligible, repeated_at DESC);
CREATE INDEX IF NOT EXISTS retention_calibration_student_time_idx
  ON public.retention_calibration_measurements (student_id, repeated_at DESC);

ALTER TABLE public.retention_calibration_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.retention_calibration_measurements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.retention_calibration_measurements TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_retention_calibration_v1(p_session_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_rows integer := 0;
BEGIN
  WITH current_sessions AS (
    SELECT e.student_id, e.source_id AS quiz_session_id, e.subject, e.topic,
      min(e.occurred_at) AS repeated_at,
      round((100 * sum(e.score) / nullif(sum(e.max_score), 0))::numeric, 2) AS actual_score_pct
    FROM public.learning_events e
    WHERE e.source_type = 'quiz_session' AND e.source_id IS NOT NULL
      AND (p_session_ids IS NULL OR e.source_id = ANY(p_session_ids))
    GROUP BY e.student_id, e.source_id, e.subject, e.topic
  ), prior_evidence AS (
    SELECT c.*, coalesce(p.prior_event_count, 0) AS prior_event_count,
      p.previous_practiced_at,
      round(100 * ((coalesce(p.weighted_correct, 0) + 1.8)
        / (coalesce(p.total_weight, 0) + 3)), 2) AS prior_mastery
    FROM current_sessions c
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS prior_event_count,
        max(prior.occurred_at) AS previous_practiced_at,
        sum((prior.score / prior.max_score) * prior.difficulty_weight) AS weighted_correct,
        sum(prior.difficulty_weight) AS total_weight
      FROM public.learning_events prior
      WHERE prior.student_id = c.student_id
        AND lower(prior.subject) = lower(c.subject)
        AND lower(prior.topic) = lower(c.topic)
        AND prior.source_id <> c.quiz_session_id
        AND prior.occurred_at < c.repeated_at
    ) p ON true
  ), predicted AS (
    SELECT *,
      CASE WHEN prior_mastery >= 80 THEN 30::numeric
        WHEN prior_mastery >= 50 THEN 14::numeric ELSE 7::numeric END AS decay_constant_days,
      CASE WHEN previous_practiced_at IS NULL THEN NULL
        ELSE extract(epoch FROM (repeated_at - previous_practiced_at)) / 86400 END AS repeat_interval_days
    FROM prior_evidence
  ), retained AS (
    SELECT *, round((100 * exp(-coalesce(repeat_interval_days, 0) / decay_constant_days))::numeric, 2)
      AS predicted_retention
    FROM predicted
  ), scored AS (
    SELECT *, round((prior_mastery * predicted_retention / 100)::numeric, 2) AS predicted_recall_pct,
      CASE WHEN repeat_interval_days IS NULL OR repeat_interval_days < 1 THEN 'same_day'
        WHEN repeat_interval_days < 7 THEN '1_6_days'
        WHEN repeat_interval_days < 14 THEN '7_13_days'
        WHEN repeat_interval_days < 30 THEN '14_29_days'
        ELSE '30_plus_days' END AS interval_bucket
    FROM retained
  ), final AS (
    SELECT *, round(actual_score_pct - predicted_recall_pct, 2) AS signed_error,
      round(abs(actual_score_pct - predicted_recall_pct), 2) AS absolute_error,
      round(power(actual_score_pct - predicted_recall_pct, 2), 4) AS squared_error,
      (prior_event_count >= 3 AND repeat_interval_days >= 1) AS is_eligible
    FROM scored
  )
  INSERT INTO public.retention_calibration_measurements (
    student_id, quiz_session_id, subject, topic, previous_practiced_at, repeated_at,
    repeat_interval_days, prior_event_count, prior_mastery, decay_constant_days,
    predicted_retention, predicted_recall_pct, actual_score_pct, signed_error,
    absolute_error, squared_error, interval_bucket, is_eligible, updated_at
  )
  SELECT student_id, quiz_session_id, subject, topic, previous_practiced_at, repeated_at,
    repeat_interval_days, prior_event_count, prior_mastery, decay_constant_days,
    predicted_retention, predicted_recall_pct, actual_score_pct, signed_error,
    absolute_error, squared_error, interval_bucket, is_eligible, now()
  FROM final
  ON CONFLICT (quiz_session_id, subject, topic, algorithm_version) DO UPDATE SET
    previous_practiced_at = EXCLUDED.previous_practiced_at,
    repeated_at = EXCLUDED.repeated_at,
    repeat_interval_days = EXCLUDED.repeat_interval_days,
    prior_event_count = EXCLUDED.prior_event_count,
    prior_mastery = EXCLUDED.prior_mastery,
    decay_constant_days = EXCLUDED.decay_constant_days,
    predicted_retention = EXCLUDED.predicted_retention,
    predicted_recall_pct = EXCLUDED.predicted_recall_pct,
    actual_score_pct = EXCLUDED.actual_score_pct,
    signed_error = EXCLUDED.signed_error,
    absolute_error = EXCLUDED.absolute_error,
    squared_error = EXCLUDED.squared_error,
    interval_bucket = EXCLUDED.interval_bucket,
    is_eligible = EXCLUDED.is_eligible,
    evaluated_at = now(), updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_retention_calibration_v1(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_retention_calibration_v1(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.measure_retention_after_events_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_session_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT source_id) INTO v_session_ids
  FROM inserted_learning_events
  WHERE source_type = 'quiz_session' AND source_id IS NOT NULL;
  IF coalesce(array_length(v_session_ids, 1), 0) > 0 THEN
    PERFORM public.refresh_retention_calibration_v1(v_session_ids);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS zzzz_learning_events_measure_retention_v1 ON public.learning_events;
CREATE TRIGGER zzzz_learning_events_measure_retention_v1
AFTER INSERT ON public.learning_events
REFERENCING NEW TABLE AS inserted_learning_events
FOR EACH STATEMENT EXECUTE FUNCTION public.measure_retention_after_events_v1();

REVOKE ALL ON FUNCTION public.measure_retention_after_events_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measure_retention_after_events_v1() TO service_role;

CREATE OR REPLACE VIEW public.retention_calibration_summary
WITH (security_invoker = true) AS
SELECT subject, interval_bucket, algorithm_version,
  count(*)::bigint AS sample_size,
  count(*) FILTER (WHERE is_eligible)::bigint AS eligible_sample_size,
  round(avg(repeat_interval_days) FILTER (WHERE is_eligible), 2) AS avg_repeat_interval_days,
  round(avg(prior_mastery) FILTER (WHERE is_eligible), 2) AS avg_prior_mastery,
  round(avg(predicted_retention) FILTER (WHERE is_eligible), 2) AS avg_predicted_retention,
  round(avg(predicted_recall_pct) FILTER (WHERE is_eligible), 2) AS avg_predicted_recall_pct,
  round(avg(actual_score_pct) FILTER (WHERE is_eligible), 2) AS avg_actual_score_pct,
  round(avg(signed_error) FILTER (WHERE is_eligible), 2) AS mean_signed_error,
  round(avg(absolute_error) FILTER (WHERE is_eligible), 2) AS mean_absolute_error,
  round(sqrt(avg(squared_error) FILTER (WHERE is_eligible)), 2) AS root_mean_squared_error
FROM public.retention_calibration_measurements
GROUP BY subject, interval_bucket, algorithm_version;

REVOKE ALL ON public.retention_calibration_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.retention_calibration_summary TO service_role;

SELECT public.refresh_retention_calibration_v1(NULL);

COMMENT ON TABLE public.retention_calibration_measurements IS
  'Measurement-only comparison of time-decayed expected recall with observed repeat performance.';
