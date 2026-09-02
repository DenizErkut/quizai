-- Pratium Learning Data Standard / Mastery Engine v1
--
-- Additive, backward-compatible migration. Existing quiz_sessions and
-- weak_topics readers/writers remain unchanged during the rollout.

CREATE TABLE IF NOT EXISTS learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  institution_id UUID NULL,
  class_id UUID NULL,
  subject TEXT NOT NULL DEFAULT 'Genel',
  grade TEXT NULL,
  topic TEXT NOT NULL,
  learning_objective_id TEXT NULL,
  question_id TEXT NULL,
  question_index INTEGER NOT NULL CHECK (question_index >= 0),
  question_type TEXT NULL,
  difficulty TEXT NULL,
  difficulty_weight NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (difficulty_weight > 0),
  result TEXT NOT NULL CHECK (result IN ('correct', 'incorrect', 'skipped')),
  score NUMERIC(6,3) NOT NULL CHECK (score >= 0),
  max_score NUMERIC(6,3) NOT NULL DEFAULT 1 CHECK (max_score > 0),
  response_time_ms INTEGER NULL CHECK (response_time_ms IS NULL OR response_time_ms >= 0),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  hint_used BOOLEAN NOT NULL DEFAULT FALSE,
  misconception_id TEXT NULL,
  confidence NUMERIC(5,4) NULL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  source_type TEXT NOT NULL,
  source_id UUID NOT NULL,
  assignment_id UUID NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT learning_events_source_question_unique
    UNIQUE (student_id, source_type, source_id, question_index)
);

CREATE INDEX IF NOT EXISTS learning_events_student_topic_time_idx
  ON learning_events (student_id, topic, occurred_at DESC);
CREATE INDEX IF NOT EXISTS learning_events_student_objective_time_idx
  ON learning_events (student_id, learning_objective_id, occurred_at DESC)
  WHERE learning_objective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learning_events_source_idx
  ON learning_events (source_type, source_id);

CREATE TABLE IF NOT EXISTS student_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT 'Genel',
  topic TEXT NOT NULL,
  learning_objective_id TEXT NULL,
  -- PostgreSQL treats NULL values as distinct in ordinary UNIQUE constraints.
  -- This normalized key makes topic-level mastery upserts deterministic.
  learning_objective_key TEXT NOT NULL DEFAULT '',
  mastery_score NUMERIC(5,2) NOT NULL DEFAULT 60 CHECK (mastery_score BETWEEN 0 AND 100),
  confidence_score NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 1),
  retention_score NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (retention_score BETWEEN 0 AND 100),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  trend TEXT NOT NULL DEFAULT 'stable' CHECK (trend IN ('improving', 'stable', 'declining')),
  last_practiced_at TIMESTAMPTZ NULL,
  last_mastery_update TIMESTAMPTZ NOT NULL DEFAULT now(),
  primary_misconception_id TEXT NULL,
  algorithm_version TEXT NOT NULL DEFAULT 'v1',
  CONSTRAINT student_mastery_dimension_unique
    UNIQUE (student_id, subject, topic, learning_objective_key),
  CONSTRAINT student_mastery_objective_key_consistent CHECK (
    learning_objective_key = COALESCE(learning_objective_id, '')
  )
);

CREATE INDEX IF NOT EXISTS student_mastery_student_score_idx
  ON student_mastery (student_id, mastery_score, confidence_score DESC);

ALTER TABLE learning_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_mastery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_events_student_select ON learning_events;
CREATE POLICY learning_events_student_select ON learning_events
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = student_id);

DROP POLICY IF EXISTS student_mastery_student_select ON student_mastery;
CREATE POLICY student_mastery_student_select ON student_mastery
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = student_id);

-- Writes are intentionally server-only. Students may inspect their own data,
-- but cannot manufacture learning events or mastery values through Data API.
REVOKE INSERT, UPDATE, DELETE ON learning_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON student_mastery FROM anon, authenticated;
GRANT SELECT ON learning_events, student_mastery TO authenticated;
GRANT ALL ON learning_events, student_mastery TO service_role;

CREATE OR REPLACE FUNCTION record_quiz_learning_events(
  p_student_id UUID,
  p_session_id UUID
) RETURNS TABLE(inserted_events INTEGER, updated_mastery_rows INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session quiz_sessions%ROWTYPE;
  v_inserted INTEGER := 0;
  v_updated INTEGER := 0;
BEGIN
  SELECT * INTO v_session
  FROM quiz_sessions
  WHERE id = p_session_id
    AND user_id = p_student_id
    AND completed = TRUE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Completed quiz session not found for student';
  END IF;

  INSERT INTO learning_events (
    student_id, subject, grade, topic, learning_objective_id,
    question_id, question_index, question_type, difficulty,
    difficulty_weight, result, score, max_score, response_time_ms,
    attempt_count, hint_used, misconception_id, source_type, source_id,
    assignment_id, occurred_at, metadata
  )
  SELECT
    p_student_id,
    COALESCE(NULLIF(q.item->>'subject', ''), 'Genel'),
    v_session.grade,
    v_session.topic,
    NULLIF(COALESCE(q.item->>'learningObjectiveId', q.item->>'learning_objective_id'), ''),
    NULLIF(COALESCE(q.item->>'id', q.item->>'questionId'), ''),
    q.ordinality::INTEGER - 1,
    NULLIF(COALESCE(q.item->>'type', v_session.question_type), ''),
    NULLIF(COALESCE(q.item->>'difficulty', q.item->>'difficultyLevel'), ''),
    CASE lower(COALESCE(q.item->>'difficulty', q.item->>'difficultyLevel', 'normal'))
      WHEN 'kolay' THEN 0.80
      WHEN 'easy' THEN 0.80
      WHEN 'zor' THEN 1.20
      WHEN 'hard' THEN 1.20
      WHEN 'cok zor' THEN 1.40
      WHEN 'çok zor' THEN 1.40
      WHEN 'very hard' THEN 1.40
      ELSE 1.00
    END,
    CASE
      WHEN COALESCE((a.item->>'userAns')::INTEGER, -1) = -1 THEN 'skipped'
      WHEN COALESCE((a.item->>'correct')::BOOLEAN, FALSE) THEN 'correct'
      ELSE 'incorrect'
    END,
    CASE WHEN COALESCE((a.item->>'correct')::BOOLEAN, FALSE) THEN 1 ELSE 0 END,
    1,
    CASE WHEN (a.item->>'timeMs') ~ '^[0-9]+$' THEN (a.item->>'timeMs')::INTEGER END,
    1,
    COALESCE((a.item->>'hintUsed')::BOOLEAN, FALSE),
    NULLIF(a.item->>'misconceptionId', ''),
    'quiz_session',
    p_session_id,
    NULL,
    now(),
    jsonb_build_object('schema_version', 1)
  FROM jsonb_array_elements(COALESCE(v_session.questions::jsonb, '[]'::jsonb))
       WITH ORDINALITY AS q(item, ordinality)
  JOIN jsonb_array_elements(COALESCE(v_session.answers::jsonb, '[]'::jsonb))
       WITH ORDINALITY AS a(item, ordinality)
    ON a.ordinality = q.ordinality
  ON CONFLICT (student_id, source_type, source_id, question_index) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- v1 is deliberately explainable: difficulty-weighted correctness with a
  -- neutral Bayesian prior (3 virtual attempts at 60%). Confidence rises with
  -- evidence; retention decays more slowly for stronger mastery.
  WITH stats AS (
    SELECT
      student_id, subject, topic,
      COUNT(*)::INTEGER AS attempts,
      COUNT(*) FILTER (WHERE result = 'correct')::INTEGER AS corrects,
      SUM((score / max_score) * difficulty_weight) AS weighted_correct,
      SUM(difficulty_weight) AS total_weight,
      MAX(occurred_at) AS last_practiced,
      (ARRAY_AGG(misconception_id ORDER BY occurred_at DESC)
        FILTER (WHERE misconception_id IS NOT NULL))[1] AS misconception,
      AVG((score / max_score)) FILTER (
        WHERE occurred_at >= now() - INTERVAL '30 days'
      ) AS recent_rate,
      AVG((score / max_score)) FILTER (
        WHERE occurred_at < now() - INTERVAL '30 days'
          AND occurred_at >= now() - INTERVAL '60 days'
      ) AS previous_rate
    FROM learning_events
    WHERE student_id = p_student_id
      AND topic = v_session.topic
    GROUP BY student_id, subject, topic
  ), calculated AS (
    SELECT *,
      ROUND(100 * ((weighted_correct + 1.8) / (total_weight + 3)), 2) AS mastery,
      ROUND((1 - EXP(-attempts::NUMERIC / 8))::NUMERIC, 4) AS confidence
    FROM stats
  )
  INSERT INTO student_mastery (
    student_id, subject, topic, learning_objective_id, learning_objective_key,
    mastery_score, confidence_score, retention_score, attempt_count,
    correct_count, trend, last_practiced_at, last_mastery_update,
    primary_misconception_id, algorithm_version
  )
  SELECT
    student_id, subject, topic, NULL, '', mastery, confidence,
    ROUND(GREATEST(0, 100 * EXP(
      -EXTRACT(EPOCH FROM (now() - last_practiced)) / 86400
      / CASE WHEN mastery >= 80 THEN 30 WHEN mastery >= 50 THEN 14 ELSE 7 END
    ))::NUMERIC, 2),
    attempts, corrects,
    CASE
      WHEN previous_rate IS NULL OR recent_rate IS NULL THEN 'stable'
      WHEN recent_rate > previous_rate + 0.10 THEN 'improving'
      WHEN recent_rate < previous_rate - 0.10 THEN 'declining'
      ELSE 'stable'
    END,
    last_practiced, now(), misconception, 'v1'
  FROM calculated
  ON CONFLICT (student_id, subject, topic, learning_objective_key)
  DO UPDATE SET
    mastery_score = EXCLUDED.mastery_score,
    confidence_score = EXCLUDED.confidence_score,
    retention_score = EXCLUDED.retention_score,
    attempt_count = EXCLUDED.attempt_count,
    correct_count = EXCLUDED.correct_count,
    trend = EXCLUDED.trend,
    last_practiced_at = EXCLUDED.last_practiced_at,
    last_mastery_update = EXCLUDED.last_mastery_update,
    primary_misconception_id = EXCLUDED.primary_misconception_id,
    algorithm_version = EXCLUDED.algorithm_version;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN QUERY SELECT v_inserted, v_updated;
END;
$$;

REVOKE ALL ON FUNCTION record_quiz_learning_events(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_quiz_learning_events(UUID, UUID) TO service_role;

COMMENT ON TABLE learning_events IS
  'Immutable, idempotent Learning Data Standard event log. Raw evidence; do not overwrite with derived mastery.';
COMMENT ON TABLE student_mastery IS
  'Current derived student state. Rebuildable from learning_events; algorithm_version identifies scoring semantics.';
COMMENT ON FUNCTION record_quiz_learning_events(UUID, UUID) IS
  'Idempotently projects one completed quiz_session into learning_events and refreshes topic-level Mastery Engine v1 state.';
