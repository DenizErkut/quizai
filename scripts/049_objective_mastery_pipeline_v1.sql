-- Objective Mastery Pipeline v1
-- Adds an objective-level mastery projection without changing the existing
-- topic-level mastery, profile or recommendation behaviour.

CREATE OR REPLACE FUNCTION public.refresh_student_objective_mastery_v1(
  p_student_id uuid,
  p_session_id uuid DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_updated integer := 0;
BEGIN
  WITH targets AS (
    SELECT DISTINCT le.learning_objective_id
    FROM public.learning_events le
    WHERE le.student_id = p_student_id
      AND le.learning_objective_id IS NOT NULL
      AND (p_session_id IS NULL OR (
        le.source_type = 'quiz_session' AND le.source_id = p_session_id
      ))
  ), stats AS (
    SELECT
      le.student_id, le.subject, le.topic, le.learning_objective_id,
      count(*)::integer AS attempts,
      count(*) FILTER (WHERE le.result = 'correct')::integer AS corrects,
      sum((le.score / le.max_score) * le.difficulty_weight) AS weighted_correct,
      sum(le.difficulty_weight) AS total_weight,
      max(le.occurred_at) AS last_practiced,
      (array_agg(le.misconception_id ORDER BY le.occurred_at DESC)
        FILTER (WHERE le.misconception_id IS NOT NULL))[1] AS misconception,
      avg(le.score / le.max_score) FILTER (
        WHERE le.occurred_at >= now() - interval '30 days'
      ) AS recent_rate,
      avg(le.score / le.max_score) FILTER (
        WHERE le.occurred_at < now() - interval '30 days'
          AND le.occurred_at >= now() - interval '60 days'
      ) AS previous_rate
    FROM public.learning_events le
    JOIN targets t ON t.learning_objective_id = le.learning_objective_id
    WHERE le.student_id = p_student_id
    GROUP BY le.student_id, le.subject, le.topic, le.learning_objective_id
  ), calculated AS (
    SELECT *,
      round(100 * ((weighted_correct + 1.8) / (total_weight + 3)), 2) AS mastery,
      round((1 - exp(-attempts::numeric / 8))::numeric, 4) AS confidence
    FROM stats
  )
  INSERT INTO public.student_mastery (
    student_id, subject, topic, learning_objective_id, learning_objective_key,
    mastery_score, confidence_score, retention_score, attempt_count,
    correct_count, trend, last_practiced_at, last_mastery_update,
    primary_misconception_id, algorithm_version
  )
  SELECT
    student_id, subject, topic, learning_objective_id, learning_objective_id,
    mastery, confidence,
    round(greatest(0, 100 * exp(
      -extract(epoch FROM (now() - last_practiced)) / 86400
      / CASE WHEN mastery >= 80 THEN 30 WHEN mastery >= 50 THEN 14 ELSE 7 END
    ))::numeric, 2),
    attempts, corrects,
    CASE
      WHEN previous_rate IS NULL OR recent_rate IS NULL THEN 'stable'
      WHEN recent_rate > previous_rate + 0.10 THEN 'improving'
      WHEN recent_rate < previous_rate - 0.10 THEN 'declining'
      ELSE 'stable'
    END,
    last_practiced, now(), misconception, 'objective_v1'
  FROM calculated
  ON CONFLICT (student_id, subject, topic, learning_objective_key)
  DO UPDATE SET
    mastery_score = excluded.mastery_score,
    confidence_score = excluded.confidence_score,
    retention_score = excluded.retention_score,
    attempt_count = excluded.attempt_count,
    correct_count = excluded.correct_count,
    trend = excluded.trend,
    last_practiced_at = excluded.last_practiced_at,
    last_mastery_update = excluded.last_mastery_update,
    primary_misconception_id = excluded.primary_misconception_id,
    algorithm_version = excluded.algorithm_version;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_student_objective_mastery_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_objective_mastery_v1(uuid, uuid)
  TO service_role;

CREATE OR REPLACE VIEW public.learning_objective_pipeline_daily
WITH (security_invoker = true)
AS
WITH sessions AS (
  SELECT
    date_trunc('day', qs.created_at) AS day,
    count(*) FILTER (WHERE qs.completed) AS completed_sessions,
    coalesce(sum(qs.question_count) FILTER (WHERE qs.completed), 0) AS questions,
    coalesce(sum(qs.objective_mapped_count) FILTER (WHERE qs.completed), 0) AS mapped_questions
  FROM public.quiz_sessions qs
  GROUP BY 1
), events AS (
  SELECT
    date_trunc('day', le.occurred_at) AS day,
    count(*) AS learning_events,
    count(*) FILTER (WHERE le.learning_objective_id IS NOT NULL) AS objective_events
  FROM public.learning_events le
  GROUP BY 1
)
SELECT
  coalesce(s.day, e.day) AS day,
  coalesce(s.completed_sessions, 0) AS completed_sessions,
  coalesce(s.questions, 0) AS questions,
  coalesce(s.mapped_questions, 0) AS mapped_questions,
  CASE WHEN coalesce(s.questions, 0) = 0 THEN 0
    ELSE round(100.0 * s.mapped_questions / s.questions, 2) END AS mapping_rate_pct,
  coalesce(e.learning_events, 0) AS learning_events,
  coalesce(e.objective_events, 0) AS objective_events,
  CASE WHEN coalesce(e.learning_events, 0) = 0 THEN 0
    ELSE round(100.0 * e.objective_events / e.learning_events, 2) END AS event_objective_rate_pct
FROM sessions s
FULL JOIN events e USING (day);

REVOKE ALL ON public.learning_objective_pipeline_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learning_objective_pipeline_daily TO service_role;

DO $$ DECLARE v_student uuid;
BEGIN
  FOR v_student IN
    SELECT DISTINCT student_id FROM public.learning_events
    WHERE learning_objective_id IS NOT NULL
  LOOP
    PERFORM public.refresh_student_objective_mastery_v1(v_student, NULL);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.refresh_student_objective_mastery_v1(uuid, uuid) IS
  'Rebuilds objective-level mastery for objectives touched by a quiz session; NULL session backfills all objective evidence for one student.';
COMMENT ON VIEW public.learning_objective_pipeline_daily IS
  'Service-only daily coverage from completed quiz questions to Learning Events carrying a canonical objective.';
