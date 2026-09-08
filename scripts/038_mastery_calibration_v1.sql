-- Mastery Engine v1 calibration measurement
-- Compares the topic mastery predicted before a quiz with that quiz's
-- observed score. This is measurement-only and does not change scoring.

CREATE TABLE IF NOT EXISTS public.mastery_calibration_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  subject text NOT NULL,
  topic text NOT NULL,
  predicted_mastery numeric(5,2) NOT NULL CHECK (predicted_mastery BETWEEN 0 AND 100),
  prediction_confidence numeric(5,4) NOT NULL CHECK (prediction_confidence BETWEEN 0 AND 1),
  prior_event_count integer NOT NULL CHECK (prior_event_count >= 0),
  actual_score_pct numeric(5,2) NOT NULL CHECK (actual_score_pct BETWEEN 0 AND 100),
  signed_error numeric(6,2) NOT NULL,
  absolute_error numeric(5,2) NOT NULL CHECK (absolute_error BETWEEN 0 AND 100),
  squared_error numeric(10,4) NOT NULL CHECK (squared_error >= 0),
  calibration_bin smallint NOT NULL CHECK (calibration_bin BETWEEN 0 AND 9),
  is_eligible boolean NOT NULL DEFAULT false,
  algorithm_version text NOT NULL DEFAULT 'v1',
  measurement_version text NOT NULL DEFAULT 'mastery-calibration-v1',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mastery_calibration_session_dimension_unique
    UNIQUE (quiz_session_id, subject, topic, algorithm_version)
);

CREATE INDEX IF NOT EXISTS mastery_calibration_subject_time_idx
  ON public.mastery_calibration_measurements (subject, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS mastery_calibration_eligible_bin_idx
  ON public.mastery_calibration_measurements (is_eligible, calibration_bin, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS mastery_calibration_student_time_idx
  ON public.mastery_calibration_measurements (student_id, evaluated_at DESC);

ALTER TABLE public.mastery_calibration_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mastery_calibration_measurements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mastery_calibration_measurements TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_mastery_calibration_v1(p_session_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_rows integer := 0;
BEGIN
  WITH current_sessions AS (
    SELECT e.student_id, e.source_id AS quiz_session_id, e.subject, e.topic,
      min(e.occurred_at) AS session_started_at,
      round((100 * sum(e.score) / nullif(sum(e.max_score), 0))::numeric, 2) AS actual_score_pct
    FROM public.learning_events e
    WHERE e.source_type = 'quiz_session' AND e.source_id IS NOT NULL
      AND (p_session_ids IS NULL OR e.source_id = ANY(p_session_ids))
    GROUP BY e.student_id, e.source_id, e.subject, e.topic
  ), predictions AS (
    SELECT c.*,
      coalesce(p.prior_event_count, 0) AS prior_event_count,
      round(100 * ((coalesce(p.weighted_correct, 0) + 1.8)
        / (coalesce(p.total_weight, 0) + 3)), 2) AS predicted_mastery,
      round((1 - exp(-coalesce(p.prior_event_count, 0)::numeric / 8))::numeric, 4)
        AS prediction_confidence
    FROM current_sessions c
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS prior_event_count,
        sum((prior.score / prior.max_score) * prior.difficulty_weight) AS weighted_correct,
        sum(prior.difficulty_weight) AS total_weight
      FROM public.learning_events prior
      WHERE prior.student_id = c.student_id
        AND lower(prior.subject) = lower(c.subject)
        AND lower(prior.topic) = lower(c.topic)
        AND prior.source_id <> c.quiz_session_id
        AND prior.occurred_at < c.session_started_at
    ) p ON true
  ), scored AS (
    SELECT *, round(actual_score_pct - predicted_mastery, 2) AS signed_error,
      round(abs(actual_score_pct - predicted_mastery), 2) AS absolute_error,
      round(power(actual_score_pct - predicted_mastery, 2), 4) AS squared_error,
      least(9, floor(predicted_mastery / 10)::smallint) AS calibration_bin,
      (prior_event_count >= 3) AS is_eligible
    FROM predictions
  )
  INSERT INTO public.mastery_calibration_measurements (
    student_id, quiz_session_id, subject, topic, predicted_mastery,
    prediction_confidence, prior_event_count, actual_score_pct, signed_error,
    absolute_error, squared_error, calibration_bin, is_eligible,
    algorithm_version, measurement_version, evaluated_at, updated_at
  )
  SELECT student_id, quiz_session_id, subject, topic, predicted_mastery,
    prediction_confidence, prior_event_count, actual_score_pct, signed_error,
    absolute_error, squared_error, calibration_bin, is_eligible,
    'v1', 'mastery-calibration-v1', now(), now()
  FROM scored
  ON CONFLICT (quiz_session_id, subject, topic, algorithm_version) DO UPDATE SET
    predicted_mastery = EXCLUDED.predicted_mastery,
    prediction_confidence = EXCLUDED.prediction_confidence,
    prior_event_count = EXCLUDED.prior_event_count,
    actual_score_pct = EXCLUDED.actual_score_pct,
    signed_error = EXCLUDED.signed_error,
    absolute_error = EXCLUDED.absolute_error,
    squared_error = EXCLUDED.squared_error,
    calibration_bin = EXCLUDED.calibration_bin,
    is_eligible = EXCLUDED.is_eligible,
    measurement_version = EXCLUDED.measurement_version,
    evaluated_at = EXCLUDED.evaluated_at,
    updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_mastery_calibration_v1(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_mastery_calibration_v1(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.measure_mastery_calibration_after_events_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_session_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT source_id) INTO v_session_ids
  FROM inserted_learning_events
  WHERE source_type = 'quiz_session' AND source_id IS NOT NULL;

  IF coalesce(array_length(v_session_ids, 1), 0) > 0 THEN
    PERFORM public.refresh_mastery_calibration_v1(v_session_ids);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS zzz_learning_events_measure_mastery_calibration_v1 ON public.learning_events;
CREATE TRIGGER zzz_learning_events_measure_mastery_calibration_v1
AFTER INSERT ON public.learning_events
REFERENCING NEW TABLE AS inserted_learning_events
FOR EACH STATEMENT EXECUTE FUNCTION public.measure_mastery_calibration_after_events_v1();

REVOKE ALL ON FUNCTION public.measure_mastery_calibration_after_events_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measure_mastery_calibration_after_events_v1() TO service_role;

CREATE OR REPLACE VIEW public.mastery_calibration_summary
WITH (security_invoker = true) AS
SELECT subject, algorithm_version, calibration_bin,
  calibration_bin * 10 AS predicted_range_start,
  calibration_bin * 10 + 9 AS predicted_range_end,
  count(*)::bigint AS sample_size,
  count(*) FILTER (WHERE is_eligible)::bigint AS eligible_sample_size,
  round(avg(predicted_mastery) FILTER (WHERE is_eligible), 2) AS avg_predicted_mastery,
  round(avg(actual_score_pct) FILTER (WHERE is_eligible), 2) AS avg_actual_score_pct,
  round(avg(signed_error) FILTER (WHERE is_eligible), 2) AS mean_signed_error,
  round(avg(absolute_error) FILTER (WHERE is_eligible), 2) AS mean_absolute_error,
  round(sqrt(avg(squared_error) FILTER (WHERE is_eligible)), 2) AS root_mean_squared_error,
  min(evaluated_at) AS first_evaluated_at,
  max(evaluated_at) AS last_evaluated_at
FROM public.mastery_calibration_measurements
GROUP BY subject, algorithm_version, calibration_bin;

REVOKE ALL ON public.mastery_calibration_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mastery_calibration_summary TO service_role;

-- Backfill is idempotent and derives predictions only from evidence available
-- before each historical quiz.
SELECT public.refresh_mastery_calibration_v1(NULL);

COMMENT ON TABLE public.mastery_calibration_measurements IS
  'Measurement-only comparison of pre-quiz Mastery Engine v1 predictions with observed quiz outcomes.';
COMMENT ON COLUMN public.mastery_calibration_measurements.is_eligible IS
  'True when at least three prior events exist for the same normalized subject/topic dimension.';

