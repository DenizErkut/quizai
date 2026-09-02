-- Aşama 1 — Student Learning Profile v1
-- Derived, machine-readable academic state. PII remains in the existing
-- identity architecture; this table contains learning data only.

CREATE TABLE IF NOT EXISTS student_learning_profiles (
  student_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  grade TEXT NULL,
  strong_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  weak_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  review_topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  known_misconceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  learning_pace TEXT NOT NULL DEFAULT 'unknown'
    CHECK (learning_pace IN ('unknown', 'fast', 'medium', 'deliberate')),
  recent_trend TEXT NOT NULL DEFAULT 'stable'
    CHECK (recent_trend IN ('improving', 'stable', 'declining')),
  evidence_event_count INTEGER NOT NULL DEFAULT 0 CHECK (evidence_event_count >= 0),
  mastery_dimension_count INTEGER NOT NULL DEFAULT 0 CHECK (mastery_dimension_count >= 0),
  profile_version TEXT NOT NULL DEFAULT 'v1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE student_learning_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_learning_profiles_student_select
  ON student_learning_profiles;
CREATE POLICY student_learning_profiles_student_select
  ON student_learning_profiles
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = student_id);

REVOKE INSERT, UPDATE, DELETE ON student_learning_profiles FROM anon, authenticated;
GRANT SELECT ON student_learning_profiles TO authenticated;
GRANT ALL ON student_learning_profiles TO service_role;

CREATE OR REPLACE FUNCTION refresh_student_learning_profile(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_grade TEXT;
  v_strong JSONB := '[]'::jsonb;
  v_weak JSONB := '[]'::jsonb;
  v_review JSONB := '[]'::jsonb;
  v_misconceptions JSONB := '[]'::jsonb;
  v_subjects JSONB := '[]'::jsonb;
  v_pace TEXT := 'unknown';
  v_trend TEXT := 'stable';
  v_events INTEGER := 0;
  v_dimensions INTEGER := 0;
  v_median_ms NUMERIC;
  v_improving INTEGER := 0;
  v_declining INTEGER := 0;
BEGIN
  SELECT grade INTO v_grade FROM profiles WHERE id = p_student_id;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE trend = 'improving')::INTEGER,
    COUNT(*) FILTER (WHERE trend = 'declining')::INTEGER
  INTO v_dimensions, v_improving, v_declining
  FROM student_mastery
  WHERE student_id = p_student_id
    AND learning_objective_key = '';

  SELECT COALESCE(jsonb_agg(item ORDER BY score DESC), '[]'::jsonb)
  INTO v_strong
  FROM (
    SELECT jsonb_build_object(
      'subject', subject, 'topic', topic, 'mastery', mastery_score,
      'confidence', confidence_score, 'trend', trend
    ) AS item, mastery_score AS score
    FROM student_mastery
    WHERE student_id = p_student_id
      AND learning_objective_key = ''
      AND mastery_score >= 75
      AND confidence_score >= 0.30
    ORDER BY mastery_score DESC
    LIMIT 10
  ) ranked;

  SELECT COALESCE(jsonb_agg(item ORDER BY score ASC), '[]'::jsonb)
  INTO v_weak
  FROM (
    SELECT jsonb_build_object(
      'subject', subject, 'topic', topic, 'mastery', mastery_score,
      'confidence', confidence_score, 'trend', trend
    ) AS item, mastery_score AS score
    FROM student_mastery
    WHERE student_id = p_student_id
      AND learning_objective_key = ''
      AND mastery_score < 50
    ORDER BY mastery_score ASC
    LIMIT 10
  ) ranked;

  SELECT COALESCE(jsonb_agg(item ORDER BY practiced_at ASC), '[]'::jsonb)
  INTO v_review
  FROM (
    SELECT jsonb_build_object(
      'subject', subject, 'topic', topic, 'mastery', mastery_score,
      'lastPracticedAt', last_practiced_at
    ) AS item, last_practiced_at AS practiced_at
    FROM student_mastery
    WHERE student_id = p_student_id
      AND learning_objective_key = ''
      AND last_practiced_at < now() - (
        CASE WHEN mastery_score >= 80 THEN INTERVAL '30 days'
             WHEN mastery_score >= 50 THEN INTERVAL '14 days'
             ELSE INTERVAL '7 days' END
      )
    ORDER BY last_practiced_at ASC
    LIMIT 10
  ) ranked;

  SELECT COALESCE(jsonb_agg(DISTINCT primary_misconception_id), '[]'::jsonb)
  INTO v_misconceptions
  FROM student_mastery
  WHERE student_id = p_student_id
    AND primary_misconception_id IS NOT NULL;

  SELECT COALESCE(jsonb_agg(summary ORDER BY subject_name), '[]'::jsonb)
  INTO v_subjects
  FROM (
    SELECT subject AS subject_name, jsonb_build_object(
      'subject', subject,
      'averageMastery', ROUND(AVG(mastery_score), 2),
      'averageConfidence', ROUND(AVG(confidence_score), 4),
      'topicCount', COUNT(*)
    ) AS summary
    FROM student_mastery
    WHERE student_id = p_student_id
      AND learning_objective_key = ''
    GROUP BY subject
  ) subjects;

  SELECT COUNT(*)::INTEGER,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY response_time_ms)
  INTO v_events, v_median_ms
  FROM learning_events
  WHERE student_id = p_student_id;

  IF v_events >= 5 AND v_median_ms IS NOT NULL THEN
    v_pace := CASE WHEN v_median_ms <= 5000 THEN 'fast'
                   WHEN v_median_ms <= 20000 THEN 'medium'
                   ELSE 'deliberate' END;
  END IF;

  v_trend := CASE WHEN v_improving > v_declining THEN 'improving'
                  WHEN v_declining > v_improving THEN 'declining'
                  ELSE 'stable' END;

  INSERT INTO student_learning_profiles (
    student_id, grade, strong_topics, weak_topics, review_topics,
    known_misconceptions, subject_summary, learning_pace, recent_trend,
    evidence_event_count, mastery_dimension_count, profile_version, updated_at
  ) VALUES (
    p_student_id, v_grade, v_strong, v_weak, v_review,
    v_misconceptions, v_subjects, v_pace, v_trend,
    v_events, v_dimensions, 'v1', now()
  )
  ON CONFLICT (student_id) DO UPDATE SET
    grade = EXCLUDED.grade,
    strong_topics = EXCLUDED.strong_topics,
    weak_topics = EXCLUDED.weak_topics,
    review_topics = EXCLUDED.review_topics,
    known_misconceptions = EXCLUDED.known_misconceptions,
    subject_summary = EXCLUDED.subject_summary,
    learning_pace = EXCLUDED.learning_pace,
    recent_trend = EXCLUDED.recent_trend,
    evidence_event_count = EXCLUDED.evidence_event_count,
    mastery_dimension_count = EXCLUDED.mastery_dimension_count,
    profile_version = EXCLUDED.profile_version,
    updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION refresh_student_learning_profile(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION refresh_student_learning_profile(UUID) TO service_role;

CREATE OR REPLACE FUNCTION refresh_learning_profile_after_mastery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM refresh_student_learning_profile(NEW.student_id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION refresh_learning_profile_after_mastery()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS student_mastery_refresh_learning_profile
  ON student_mastery;
CREATE TRIGGER student_mastery_refresh_learning_profile
AFTER INSERT OR UPDATE OF mastery_score, confidence_score, retention_score,
  trend, last_practiced_at, primary_misconception_id
ON student_mastery
FOR EACH ROW EXECUTE FUNCTION refresh_learning_profile_after_mastery();

-- Existing mastery rows are few and this one-time refresh is bounded to
-- distinct students. Historical quiz backfill remains a separate operation.
DO $$
DECLARE v_student_id UUID;
BEGIN
  FOR v_student_id IN SELECT DISTINCT student_id FROM student_mastery LOOP
    PERFORM refresh_student_learning_profile(v_student_id);
  END LOOP;
END;
$$;

COMMENT ON TABLE student_learning_profiles IS
  'Aşama 1: PII-free, machine-readable academic profile derived from learning_events and student_mastery.';
