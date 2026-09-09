-- Question difficulty calibration v1
-- Measurement-only: no production difficulty or mastery weights are changed.

CREATE OR REPLACE FUNCTION public.learning_event_question_fingerprint_v1(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN nullif(trim(p_text), '') IS NULL THEN NULL
    ELSE 'qv1_' || md5(lower(regexp_replace(trim(p_text), '\s+', ' ', 'g'))) END
$$;

REVOKE ALL ON FUNCTION public.learning_event_question_fingerprint_v1(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.learning_event_question_fingerprint_v1(text) TO service_role;

CREATE OR REPLACE FUNCTION public.assign_learning_event_question_id_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_question_text text;
BEGIN
  IF NEW.question_id IS NULL AND NEW.source_type = 'quiz_session' AND NEW.source_id IS NOT NULL THEN
    SELECT question->>'q' INTO v_question_text
    FROM public.quiz_sessions s
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.questions::jsonb, '[]'::jsonb))
      WITH ORDINALITY AS item(question, ordinality)
    WHERE s.id = NEW.source_id AND item.ordinality = NEW.question_index + 1;
    NEW.question_id := public.learning_event_question_fingerprint_v1(v_question_text);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_learning_event_question_id_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS learning_events_assign_question_id_v1 ON public.learning_events;
CREATE TRIGGER learning_events_assign_question_id_v1
BEFORE INSERT ON public.learning_events
FOR EACH ROW EXECUTE FUNCTION public.assign_learning_event_question_id_v1();

-- One-time, idempotent identity backfill for historical Learning Events.
WITH identities AS (
  SELECT e.id, public.learning_event_question_fingerprint_v1(item.question->>'q') question_id
  FROM public.learning_events e
  JOIN public.quiz_sessions s ON s.id = e.source_id AND e.source_type = 'quiz_session'
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.questions::jsonb, '[]'::jsonb))
    WITH ORDINALITY AS item(question, ordinality)
  WHERE e.question_id IS NULL AND item.ordinality = e.question_index + 1
)
UPDATE public.learning_events e SET question_id = identities.question_id
FROM identities WHERE identities.id = e.id AND identities.question_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.question_difficulty_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_event_id uuid NOT NULL REFERENCES public.learning_events(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_session_id uuid REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  subject text NOT NULL,
  grade text,
  topic text NOT NULL,
  question_type text,
  assigned_difficulty text NOT NULL,
  assigned_rank smallint NOT NULL CHECK (assigned_rank BETWEEN 1 AND 4),
  prior_event_count integer NOT NULL CHECK (prior_event_count >= 0),
  prior_mastery numeric(5,2) NOT NULL CHECK (prior_mastery BETWEEN 0 AND 100),
  predicted_success_pct numeric(5,2) NOT NULL CHECK (predicted_success_pct BETWEEN 0 AND 100),
  actual_score_pct numeric(5,2) NOT NULL CHECK (actual_score_pct BETWEEN 0 AND 100),
  signed_error numeric(6,2) NOT NULL,
  absolute_error numeric(5,2) NOT NULL CHECK (absolute_error BETWEEN 0 AND 100),
  is_eligible boolean NOT NULL DEFAULT false,
  algorithm_version text NOT NULL DEFAULT 'difficulty-calibration-v1',
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_difficulty_measurement_event_unique UNIQUE (learning_event_id, algorithm_version)
);

CREATE INDEX IF NOT EXISTS question_difficulty_label_idx
  ON public.question_difficulty_measurements (subject, assigned_difficulty, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS question_difficulty_question_idx
  ON public.question_difficulty_measurements (question_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS question_difficulty_eligible_idx
  ON public.question_difficulty_measurements (is_eligible, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS question_difficulty_student_idx
  ON public.question_difficulty_measurements (student_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS question_difficulty_session_idx
  ON public.question_difficulty_measurements (quiz_session_id)
  WHERE quiz_session_id IS NOT NULL;

ALTER TABLE public.question_difficulty_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.question_difficulty_measurements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.question_difficulty_measurements TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_question_difficulty_calibration_v1(p_session_ids uuid[] DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_rows integer := 0;
BEGIN
  WITH evidence AS (
    SELECT e.id learning_event_id, e.question_id, e.student_id, e.source_id quiz_session_id,
      e.subject, e.grade, e.topic, e.question_type,
      CASE lower(coalesce(e.difficulty, 'normal'))
        WHEN 'kolay' THEN 'easy' WHEN 'easy' THEN 'easy'
        WHEN 'zor' THEN 'hard' WHEN 'hard' THEN 'hard'
        WHEN 'cok zor' THEN 'very_hard' WHEN 'çok zor' THEN 'very_hard'
        WHEN 'very hard' THEN 'very_hard' WHEN 'very_hard' THEN 'very_hard'
        ELSE 'normal' END assigned_difficulty,
      CASE lower(coalesce(e.difficulty, 'normal'))
        WHEN 'kolay' THEN 1 WHEN 'easy' THEN 1
        WHEN 'zor' THEN 3 WHEN 'hard' THEN 3
        WHEN 'cok zor' THEN 4 WHEN 'çok zor' THEN 4
        WHEN 'very hard' THEN 4 WHEN 'very_hard' THEN 4 ELSE 2 END assigned_rank,
      CASE WHEN e.result = 'correct' THEN 100::numeric ELSE 0::numeric END actual_score_pct,
      coalesce(p.prior_event_count, 0) prior_event_count,
      round(100 * ((coalesce(p.weighted_correct, 0) + 1.8) /
        (coalesce(p.total_weight, 0) + 3)), 2) prior_mastery
    FROM public.learning_events e
    LEFT JOIN LATERAL (
      SELECT count(*)::integer prior_event_count,
        sum((prior.score / nullif(prior.max_score, 0)) * prior.difficulty_weight) weighted_correct,
        sum(prior.difficulty_weight) total_weight
      FROM public.learning_events prior
      WHERE prior.student_id = e.student_id
        AND lower(prior.subject) = lower(e.subject)
        AND lower(prior.topic) = lower(e.topic)
        AND prior.source_id IS DISTINCT FROM e.source_id
        AND prior.occurred_at < e.occurred_at
    ) p ON true
    WHERE e.source_type = 'quiz_session' AND e.source_id IS NOT NULL
      AND e.question_id IS NOT NULL AND e.result IN ('correct', 'incorrect')
      AND (p_session_ids IS NULL OR e.source_id = ANY(p_session_ids))
  ), expected AS (
    SELECT *, CASE assigned_difficulty
      WHEN 'easy' THEN 80::numeric WHEN 'hard' THEN 45::numeric
      WHEN 'very_hard' THEN 30::numeric ELSE 65::numeric END label_success_at_60
    FROM evidence
  ), predicted AS (
    SELECT *, round((100 / (1 + exp(-(
      ln(greatest(5, least(95, prior_mastery)) / (100 - greatest(5, least(95, prior_mastery))))
      + ln(label_success_at_60 / (100 - label_success_at_60))
      - ln(60::numeric / 40)
    ))))::numeric, 2) predicted_success_pct
    FROM expected
  )
  INSERT INTO public.question_difficulty_measurements (
    learning_event_id, question_id, student_id, quiz_session_id, subject, grade, topic,
    question_type, assigned_difficulty, assigned_rank, prior_event_count, prior_mastery,
    predicted_success_pct, actual_score_pct, signed_error, absolute_error, is_eligible, updated_at
  )
  SELECT learning_event_id, question_id, student_id, quiz_session_id, subject, grade, topic,
    question_type, assigned_difficulty, assigned_rank, prior_event_count, prior_mastery,
    predicted_success_pct, actual_score_pct,
    round(actual_score_pct - predicted_success_pct, 2),
    round(abs(actual_score_pct - predicted_success_pct), 2), prior_event_count >= 3, now()
  FROM predicted
  ON CONFLICT (learning_event_id, algorithm_version) DO UPDATE SET
    question_id = EXCLUDED.question_id, prior_event_count = EXCLUDED.prior_event_count,
    prior_mastery = EXCLUDED.prior_mastery, predicted_success_pct = EXCLUDED.predicted_success_pct,
    actual_score_pct = EXCLUDED.actual_score_pct, signed_error = EXCLUDED.signed_error,
    absolute_error = EXCLUDED.absolute_error, is_eligible = EXCLUDED.is_eligible,
    evaluated_at = now(), updated_at = now();
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_question_difficulty_calibration_v1(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_question_difficulty_calibration_v1(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.measure_question_difficulty_after_events_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_session_ids uuid[];
BEGIN
  SELECT array_agg(DISTINCT source_id) INTO v_session_ids FROM inserted_learning_events
  WHERE source_type = 'quiz_session' AND source_id IS NOT NULL;
  IF coalesce(array_length(v_session_ids, 1), 0) > 0 THEN
    PERFORM public.refresh_question_difficulty_calibration_v1(v_session_ids);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.measure_question_difficulty_after_events_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS zzzzz_learning_events_measure_question_difficulty_v1 ON public.learning_events;
CREATE TRIGGER zzzzz_learning_events_measure_question_difficulty_v1
AFTER INSERT ON public.learning_events REFERENCING NEW TABLE AS inserted_learning_events
FOR EACH STATEMENT EXECUTE FUNCTION public.measure_question_difficulty_after_events_v1();

CREATE OR REPLACE VIEW public.question_difficulty_label_summary
WITH (security_invoker = true) AS
SELECT subject, grade, assigned_difficulty, assigned_rank, algorithm_version,
  count(*)::bigint sample_size,
  count(*) FILTER (WHERE is_eligible)::bigint eligible_sample_size,
  count(DISTINCT student_id) FILTER (WHERE is_eligible)::bigint eligible_students,
  round(avg(prior_mastery) FILTER (WHERE is_eligible), 2) avg_prior_mastery,
  round(avg(predicted_success_pct) FILTER (WHERE is_eligible), 2) avg_predicted_success_pct,
  round(avg(actual_score_pct) FILTER (WHERE is_eligible), 2) avg_actual_score_pct,
  round(avg(signed_error) FILTER (WHERE is_eligible), 2) mean_signed_error,
  round(avg(absolute_error) FILTER (WHERE is_eligible), 2) mean_absolute_error,
  CASE WHEN count(*) FILTER (WHERE is_eligible) < 20
      OR count(DISTINCT student_id) FILTER (WHERE is_eligible) < 3 THEN 'insufficient_sample'
    WHEN avg(signed_error) FILTER (WHERE is_eligible) > 8 THEN 'easier_than_label'
    WHEN avg(signed_error) FILTER (WHERE is_eligible) < -8 THEN 'harder_than_label'
    ELSE 'calibrated' END calibration_status
FROM public.question_difficulty_measurements
GROUP BY subject, grade, assigned_difficulty, assigned_rank, algorithm_version;

CREATE OR REPLACE VIEW public.question_difficulty_item_summary
WITH (security_invoker = true) AS
SELECT question_id, subject, grade, topic, question_type, assigned_difficulty,
  count(*)::bigint attempts, count(DISTINCT student_id)::bigint unique_students,
  round(avg(actual_score_pct), 2) observed_success_pct,
  round(avg(predicted_success_pct), 2) expected_success_pct,
  round(avg(signed_error), 2) mean_signed_error,
  (count(*) >= 5 AND count(DISTINCT student_id) >= 3) is_item_eligible
FROM public.question_difficulty_measurements
GROUP BY question_id, subject, grade, topic, question_type, assigned_difficulty;

REVOKE ALL ON public.question_difficulty_label_summary, public.question_difficulty_item_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.question_difficulty_label_summary, public.question_difficulty_item_summary TO service_role;

SELECT public.refresh_question_difficulty_calibration_v1(NULL);

COMMENT ON TABLE public.question_difficulty_measurements IS
  'Measurement-only comparison of assigned question difficulty with mastery-adjusted observed success.';
