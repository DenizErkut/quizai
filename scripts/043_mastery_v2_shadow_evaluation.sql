-- Mastery Engine v2 shadow evaluation
-- Measurement-only: student_mastery and production recommendations remain on v1.

CREATE TABLE IF NOT EXISTS public.mastery_shadow_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  subject text NOT NULL,
  topic text NOT NULL,
  session_started_at timestamptz NOT NULL,
  prior_event_count integer NOT NULL CHECK (prior_event_count >= 0),
  days_since_practice numeric(10,3),
  v1_predicted_mastery numeric(5,2) NOT NULL CHECK (v1_predicted_mastery BETWEEN 0 AND 100),
  retention_factor numeric(6,5) NOT NULL CHECK (retention_factor BETWEEN 0 AND 1),
  difficulty_adjustment numeric(5,2) NOT NULL CHECK (difficulty_adjustment BETWEEN -5 AND 5),
  v2_predicted_mastery numeric(5,2) NOT NULL CHECK (v2_predicted_mastery BETWEEN 0 AND 100),
  actual_score_pct numeric(5,2) NOT NULL CHECK (actual_score_pct BETWEEN 0 AND 100),
  v1_signed_error numeric(6,2) NOT NULL,
  v1_absolute_error numeric(5,2) NOT NULL CHECK (v1_absolute_error BETWEEN 0 AND 100),
  v1_squared_error numeric(10,4) NOT NULL CHECK (v1_squared_error >= 0),
  v2_signed_error numeric(6,2) NOT NULL,
  v2_absolute_error numeric(5,2) NOT NULL CHECK (v2_absolute_error BETWEEN 0 AND 100),
  v2_squared_error numeric(10,4) NOT NULL CHECK (v2_squared_error >= 0),
  winning_model text NOT NULL CHECK (winning_model IN ('v1', 'v2', 'tie')),
  is_eligible boolean NOT NULL DEFAULT false,
  algorithm_version text NOT NULL DEFAULT 'mastery-v2-shadow',
  measurement_version text NOT NULL DEFAULT 'mastery-shadow-evaluation-v1',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mastery_shadow_session_dimension_unique
    UNIQUE (quiz_session_id, subject, topic, algorithm_version)
);

CREATE INDEX IF NOT EXISTS mastery_shadow_subject_time_idx
  ON public.mastery_shadow_measurements (subject, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS mastery_shadow_eligible_time_idx
  ON public.mastery_shadow_measurements (is_eligible, session_started_at DESC);
CREATE INDEX IF NOT EXISTS mastery_shadow_student_time_idx
  ON public.mastery_shadow_measurements (student_id, session_started_at DESC);

ALTER TABLE public.mastery_shadow_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mastery_shadow_measurements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mastery_shadow_measurements TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_mastery_v2_shadow_evaluation(p_session_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_rows integer := 0;
BEGIN
  WITH current_sessions AS (
    SELECT e.student_id, e.source_id quiz_session_id, e.subject, e.grade, e.topic,
      min(e.occurred_at) session_started_at,
      round((100 * sum(e.score) / nullif(sum(e.max_score), 0))::numeric, 2) actual_score_pct
    FROM public.learning_events e
    WHERE e.source_type = 'quiz_session' AND e.source_id IS NOT NULL
      AND (p_session_ids IS NULL OR e.source_id = ANY(p_session_ids))
    GROUP BY e.student_id, e.source_id, e.subject, e.grade, e.topic
  ), prior_evidence AS (
    SELECT c.*, coalesce(p.prior_event_count, 0) prior_event_count,
      p.last_practiced_at,
      round(100 * ((coalesce(p.weighted_correct, 0) + 1.8) /
        (coalesce(p.total_weight, 0) + 3)), 2) v1_predicted_mastery
    FROM current_sessions c
    LEFT JOIN LATERAL (
      SELECT count(*)::integer prior_event_count, max(prior.occurred_at) last_practiced_at,
        sum((prior.score / nullif(prior.max_score, 0)) * prior.difficulty_weight) weighted_correct,
        sum(prior.difficulty_weight) total_weight
      FROM public.learning_events prior
      WHERE prior.student_id = c.student_id
        AND lower(prior.subject) = lower(c.subject)
        AND lower(prior.topic) = lower(c.topic)
        AND prior.source_id IS DISTINCT FROM c.quiz_session_id
        AND prior.occurred_at < c.session_started_at
    ) p ON true
  ), session_labels AS (
    SELECT c.quiz_session_id, c.subject, c.grade, c.topic, c.session_started_at,
      CASE lower(coalesce(e.difficulty, 'normal'))
        WHEN 'kolay' THEN 'easy' WHEN 'easy' THEN 'easy'
        WHEN 'zor' THEN 'hard' WHEN 'hard' THEN 'hard'
        WHEN 'cok zor' THEN 'very_hard' WHEN 'çok zor' THEN 'very_hard'
        WHEN 'very hard' THEN 'very_hard' WHEN 'very_hard' THEN 'very_hard'
        ELSE 'normal' END assigned_difficulty,
      count(*)::integer question_count
    FROM current_sessions c
    JOIN public.learning_events e ON e.source_id = c.quiz_session_id
      AND lower(e.subject) = lower(c.subject) AND lower(e.topic) = lower(c.topic)
    GROUP BY c.quiz_session_id, c.subject, c.grade, c.topic, c.session_started_at,
      CASE lower(coalesce(e.difficulty, 'normal'))
        WHEN 'kolay' THEN 'easy' WHEN 'easy' THEN 'easy'
        WHEN 'zor' THEN 'hard' WHEN 'hard' THEN 'hard'
        WHEN 'cok zor' THEN 'very_hard' WHEN 'çok zor' THEN 'very_hard'
        WHEN 'very hard' THEN 'very_hard' WHEN 'very_hard' THEN 'very_hard'
        ELSE 'normal' END
  ), label_corrections AS (
    SELECT sl.*, CASE
      WHEN count(qdm.id) >= 20 AND count(DISTINCT qdm.student_id) >= 3
        THEN greatest(-5::numeric, least(5::numeric, round((avg(qdm.signed_error) * 0.25)::numeric, 2)))
      ELSE 0::numeric END label_adjustment
    FROM session_labels sl
    LEFT JOIN public.question_difficulty_measurements qdm
      ON lower(qdm.subject) = lower(sl.subject)
      AND lower(coalesce(qdm.grade, '')) = lower(coalesce(sl.grade, ''))
      AND qdm.assigned_difficulty = sl.assigned_difficulty
    LEFT JOIN public.learning_events qle
      ON qle.id = qdm.learning_event_id AND qle.occurred_at < sl.session_started_at
    WHERE qdm.id IS NULL OR qle.id IS NOT NULL
    GROUP BY sl.quiz_session_id, sl.subject, sl.grade, sl.topic, sl.session_started_at,
      sl.assigned_difficulty, sl.question_count
  ), difficulty AS (
    SELECT quiz_session_id, subject, topic,
      coalesce(round((sum(label_adjustment * question_count) /
        nullif(sum(question_count), 0))::numeric, 2), 0) difficulty_adjustment
    FROM label_corrections GROUP BY quiz_session_id, subject, topic
  ), modeled AS (
    SELECT p.*,
      CASE WHEN p.last_practiced_at IS NULL THEN NULL
        ELSE extract(epoch FROM (p.session_started_at - p.last_practiced_at)) / 86400 END days_since_practice,
      coalesce(d.difficulty_adjustment, 0) difficulty_adjustment,
      CASE WHEN p.v1_predicted_mastery >= 80 THEN 30::numeric
        WHEN p.v1_predicted_mastery >= 50 THEN 14::numeric ELSE 7::numeric END decay_constant_days
    FROM prior_evidence p
    LEFT JOIN difficulty d ON d.quiz_session_id = p.quiz_session_id
      AND lower(d.subject) = lower(p.subject) AND lower(d.topic) = lower(p.topic)
  ), predictions AS (
    SELECT *, round((CASE WHEN days_since_practice IS NULL THEN 1::numeric ELSE
      0.75 + 0.25 * exp(-greatest(days_since_practice, 0) / decay_constant_days) END)::numeric, 5) retention_factor
    FROM modeled
  ), scored AS (
    SELECT *, round(greatest(0::numeric, least(100::numeric,
      v1_predicted_mastery * retention_factor + difficulty_adjustment)), 2) v2_predicted_mastery
    FROM predictions
  ), final AS (
    SELECT *, round(actual_score_pct - v1_predicted_mastery, 2) v1_signed_error,
      round(abs(actual_score_pct - v1_predicted_mastery), 2) v1_absolute_error,
      round(power(actual_score_pct - v1_predicted_mastery, 2), 4) v1_squared_error,
      round(actual_score_pct - v2_predicted_mastery, 2) v2_signed_error,
      round(abs(actual_score_pct - v2_predicted_mastery), 2) v2_absolute_error,
      round(power(actual_score_pct - v2_predicted_mastery, 2), 4) v2_squared_error
    FROM scored
  )
  INSERT INTO public.mastery_shadow_measurements (
    student_id, quiz_session_id, subject, topic, session_started_at, prior_event_count,
    days_since_practice, v1_predicted_mastery, retention_factor, difficulty_adjustment,
    v2_predicted_mastery, actual_score_pct, v1_signed_error, v1_absolute_error,
    v1_squared_error, v2_signed_error, v2_absolute_error, v2_squared_error,
    winning_model, is_eligible, updated_at
  )
  SELECT student_id, quiz_session_id, subject, topic, session_started_at, prior_event_count,
    days_since_practice, v1_predicted_mastery, retention_factor, difficulty_adjustment,
    v2_predicted_mastery, actual_score_pct, v1_signed_error, v1_absolute_error,
    v1_squared_error, v2_signed_error, v2_absolute_error, v2_squared_error,
    CASE WHEN v2_absolute_error < v1_absolute_error THEN 'v2'
      WHEN v1_absolute_error < v2_absolute_error THEN 'v1' ELSE 'tie' END,
    prior_event_count >= 3, now()
  FROM final
  ON CONFLICT (quiz_session_id, subject, topic, algorithm_version) DO UPDATE SET
    prior_event_count = EXCLUDED.prior_event_count,
    days_since_practice = EXCLUDED.days_since_practice,
    v1_predicted_mastery = EXCLUDED.v1_predicted_mastery,
    retention_factor = EXCLUDED.retention_factor,
    difficulty_adjustment = EXCLUDED.difficulty_adjustment,
    v2_predicted_mastery = EXCLUDED.v2_predicted_mastery,
    actual_score_pct = EXCLUDED.actual_score_pct,
    v1_signed_error = EXCLUDED.v1_signed_error,
    v1_absolute_error = EXCLUDED.v1_absolute_error,
    v1_squared_error = EXCLUDED.v1_squared_error,
    v2_signed_error = EXCLUDED.v2_signed_error,
    v2_absolute_error = EXCLUDED.v2_absolute_error,
    v2_squared_error = EXCLUDED.v2_squared_error,
    winning_model = EXCLUDED.winning_model,
    is_eligible = EXCLUDED.is_eligible,
    evaluated_at = now(), updated_at = now();

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_mastery_v2_shadow_evaluation(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_mastery_v2_shadow_evaluation(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.measure_mastery_v2_shadow_after_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_session_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT source_id) INTO v_session_ids FROM inserted_learning_events
  WHERE source_type = 'quiz_session' AND source_id IS NOT NULL;
  IF coalesce(array_length(v_session_ids, 1), 0) > 0 THEN
    PERFORM public.refresh_mastery_v2_shadow_evaluation(v_session_ids);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.measure_mastery_v2_shadow_after_events() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzzzzz_learning_events_measure_mastery_v2_shadow ON public.learning_events;
CREATE TRIGGER zzzzzz_learning_events_measure_mastery_v2_shadow
AFTER INSERT ON public.learning_events REFERENCING NEW TABLE AS inserted_learning_events
FOR EACH STATEMENT EXECUTE FUNCTION public.measure_mastery_v2_shadow_after_events();

CREATE OR REPLACE VIEW public.mastery_shadow_summary
WITH (security_invoker = true) AS
SELECT subject, algorithm_version,
  count(*)::bigint sample_size,
  count(*) FILTER (WHERE is_eligible)::bigint eligible_sample_size,
  count(*) FILTER (WHERE is_eligible AND winning_model = 'v1')::bigint v1_wins,
  count(*) FILTER (WHERE is_eligible AND winning_model = 'v2')::bigint v2_wins,
  count(*) FILTER (WHERE is_eligible AND winning_model = 'tie')::bigint ties,
  round(avg(v1_predicted_mastery) FILTER (WHERE is_eligible), 2) avg_v1_prediction,
  round(avg(v2_predicted_mastery) FILTER (WHERE is_eligible), 2) avg_v2_prediction,
  round(avg(actual_score_pct) FILTER (WHERE is_eligible), 2) avg_actual_score,
  round(avg(v1_absolute_error) FILTER (WHERE is_eligible), 2) v1_mean_absolute_error,
  round(avg(v2_absolute_error) FILTER (WHERE is_eligible), 2) v2_mean_absolute_error,
  round(sqrt(avg(v1_squared_error) FILTER (WHERE is_eligible)), 2) v1_root_mean_squared_error,
  round(sqrt(avg(v2_squared_error) FILTER (WHERE is_eligible)), 2) v2_root_mean_squared_error,
  round(avg(v1_absolute_error - v2_absolute_error) FILTER (WHERE is_eligible), 2) mean_absolute_error_improvement
FROM public.mastery_shadow_measurements
GROUP BY subject, algorithm_version;

REVOKE ALL ON public.mastery_shadow_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.mastery_shadow_summary TO service_role;

SELECT public.refresh_mastery_v2_shadow_evaluation(NULL);

COMMENT ON TABLE public.mastery_shadow_measurements IS
  'Measurement-only v1/v2 pre-quiz mastery comparison. It never updates student_mastery or recommendations.';
COMMENT ON COLUMN public.mastery_shadow_measurements.difficulty_adjustment IS
  'Conservative, leakage-safe adjustment: 25% of prior cohort error, clamped to +/-5 points.';
