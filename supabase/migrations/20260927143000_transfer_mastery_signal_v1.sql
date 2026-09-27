-- Transfer checks become explicit, weighted learning evidence.
CREATE OR REPLACE FUNCTION public.apply_transfer_check_to_mastery_v1(p_check_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.learning_transfer_checks%ROWTYPE;
  v_score numeric;
  v_weight numeric;
  v_key text;
  v_attempts integer;
  v_correct integer;
BEGIN
  SELECT * INTO c FROM public.learning_transfer_checks
  WHERE id = p_check_id AND status = 'completed' AND transfer_result IS NOT NULL;
  IF NOT FOUND THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.learning_events WHERE source_type = 'transfer_check' AND source_id = p_check_id) THEN RETURN 0; END IF;

  v_score := CASE c.transfer_result
    WHEN 'independent_success' THEN 1.00
    WHEN 'assisted_success' THEN 0.60
    WHEN 'not_transferred' THEN 0.00
    ELSE 0.00
  END;
  v_weight := CASE c.transfer_result
    WHEN 'independent_success' THEN 1.10
    WHEN 'assisted_success' THEN 0.90
    ELSE 0.80
  END;
  v_key := COALESCE(c.learning_objective_id, '');

  INSERT INTO public.learning_events (
    student_id, subject, grade, topic, learning_objective_id, question_id,
    question_index, question_type, difficulty, difficulty_weight, result,
    score, max_score, attempt_count, hint_used, source_type, source_id, metadata
  ) VALUES (
    c.student_id, c.subject, c.grade, c.topic, c.learning_objective_id,
    c.id::text, 0, 'transfer_check', NULL, v_weight,
    CASE WHEN v_score > 0 THEN 'correct' ELSE 'incorrect' END,
    v_score, 1, 1, (c.transfer_result = 'assisted_success'),
    'transfer_check', c.id,
    jsonb_build_object('transfer_result', c.transfer_result, 'source_session_id', c.source_session_id)
  );

  SELECT COALESCE(attempt_count, 0), COALESCE(correct_count, 0)
    INTO v_attempts, v_correct
  FROM public.student_mastery
  WHERE student_id = c.student_id AND subject = c.subject AND topic = c.topic AND learning_objective_key = v_key
  FOR UPDATE;
  v_attempts := COALESCE(v_attempts, 0);
  v_correct := COALESCE(v_correct, 0);
  INSERT INTO public.student_mastery (
    student_id, subject, topic, learning_objective_id, learning_objective_key,
    mastery_score, confidence_score, retention_score, attempt_count, correct_count,
    trend, last_practiced_at, last_mastery_update, algorithm_version
  ) VALUES (
    c.student_id, c.subject, c.topic, c.learning_objective_id, v_key,
    ROUND((60 * 3 + v_score * 100 * v_weight) / (3 + v_weight), 2),
    ROUND((1 - EXP(-(v_attempts + 1)::numeric / 8))::numeric, 4), 100,
    v_attempts + 1, v_correct + CASE WHEN v_score > 0 THEN 1 ELSE 0 END,
    CASE WHEN v_score >= 0.8 THEN 'improving' WHEN v_score = 0 THEN 'declining' ELSE 'stable' END,
    now(), now(), 'transfer-v1'
  ) ON CONFLICT (student_id, subject, topic, learning_objective_key) DO UPDATE SET
    mastery_score = ROUND((student_mastery.mastery_score * GREATEST(student_mastery.attempt_count, 1) + EXCLUDED.mastery_score) / (GREATEST(student_mastery.attempt_count, 1) + 1), 2),
    confidence_score = EXCLUDED.confidence_score,
    attempt_count = student_mastery.attempt_count + 1,
    correct_count = student_mastery.correct_count + EXCLUDED.correct_count,
    trend = EXCLUDED.trend, last_practiced_at = now(), last_mastery_update = now(), algorithm_version = 'transfer-v1';
  RETURN 1;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_transfer_check_to_mastery_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_transfer_check_to_mastery_v1(uuid) TO service_role;
