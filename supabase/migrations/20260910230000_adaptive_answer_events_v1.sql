-- Adaptive Learning v3: record each answered question before quiz completion.
-- Idempotency is inherited from learning_events_source_question_unique.
CREATE OR REPLACE FUNCTION public.record_adaptive_answer_event_v1(
  p_student_id uuid,
  p_session_id uuid,
  p_question_index integer,
  p_result text,
  p_score numeric,
  p_response_time_ms integer,
  p_hint_used boolean DEFAULT false
) RETURNS TABLE(inserted_event boolean, updated_mastery_rows integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  q jsonb;
  inserted integer := 0;
  updated integer := 0;
BEGIN
  IF p_question_index < 0 OR p_question_index >= 1000 OR p_result NOT IN ('correct','incorrect','skipped') THEN
    RAISE EXCEPTION 'Invalid adaptive answer';
  END IF;
  SELECT * INTO s FROM public.quiz_sessions WHERE id=p_session_id AND user_id=p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Quiz session not found'; END IF;
  SELECT s.questions::jsonb -> p_question_index INTO q;
  IF q IS NULL THEN RAISE EXCEPTION 'Question not found'; END IF;

  INSERT INTO public.learning_events (
    student_id, subject, grade, topic, learning_objective_id, question_id,
    question_index, question_type, difficulty, difficulty_weight, result,
    score, max_score, response_time_ms, attempt_count, hint_used,
    source_type, source_id, assignment_id, occurred_at, metadata
  ) VALUES (
    p_student_id, COALESCE(NULLIF(q->>'subject',''),'Genel'), s.grade, s.topic,
    NULLIF(COALESCE(q->>'learningObjectiveId',q->>'learning_objective_id'),''),
    NULLIF(COALESCE(q->>'id',q->>'questionId'),''), p_question_index,
    NULLIF(COALESCE(q->>'type',s.question_type),''),
    NULLIF(COALESCE(q->>'difficulty',q->>'difficultyLevel'),''),
    CASE lower(COALESCE(q->>'difficulty','normal')) WHEN 'kolay' THEN .8 WHEN 'zor' THEN 1.2 WHEN 'cok zor' THEN 1.4 ELSE 1 END,
    p_result, GREATEST(0,LEAST(1,p_score)), 1, NULLIF(GREATEST(0,p_response_time_ms),0), 1,
    p_hint_used, 'quiz_session', p_session_id, NULL,
    now(), jsonb_strip_nulls(jsonb_build_object('schema_version',1,'projection','adaptive-answer-v1','adaptivePolicyVersion',q->>'adaptivePolicyVersion','adaptiveSupportLevel',q->>'adaptiveSupportLevel'))
  ) ON CONFLICT (student_id, source_type, source_id, question_index) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  IF inserted = 1 THEN
    WITH stats AS (
      SELECT student_id,subject,topic,COUNT(*)::integer attempts,
        COUNT(*) FILTER (WHERE result='correct')::integer corrects,
        SUM((score/max_score)*difficulty_weight) weighted_correct,
        SUM(difficulty_weight) total_weight, MAX(occurred_at) last_practiced,
        AVG(score/max_score) FILTER (WHERE occurred_at >= now()-interval '30 days') recent_rate,
        AVG(score/max_score) FILTER (WHERE occurred_at < now()-interval '30 days' AND occurred_at >= now()-interval '60 days') previous_rate
      FROM public.learning_events WHERE student_id=p_student_id AND topic=s.topic GROUP BY student_id,subject,topic
    ), calculated AS (
      SELECT *, ROUND(100*((weighted_correct+1.8)/(total_weight+3)),2) mastery,
        ROUND((1-EXP(-attempts::numeric/8))::numeric,4) confidence FROM stats
    )
    INSERT INTO public.student_mastery (student_id,subject,topic,learning_objective_id,learning_objective_key,mastery_score,confidence_score,retention_score,attempt_count,correct_count,trend,last_practiced_at,last_mastery_update,algorithm_version)
    SELECT student_id,subject,topic,NULL,'',mastery,confidence,
      ROUND(GREATEST(0,100*EXP(-EXTRACT(EPOCH FROM (now()-last_practiced))/86400/CASE WHEN mastery>=80 THEN 30 WHEN mastery>=50 THEN 14 ELSE 7 END))::numeric,2),
      attempts,corrects,CASE WHEN previous_rate IS NULL OR recent_rate IS NULL THEN 'stable' WHEN recent_rate>previous_rate+.10 THEN 'improving' WHEN recent_rate<previous_rate-.10 THEN 'declining' ELSE 'stable' END,last_practiced,now(),'v1'
    FROM calculated ON CONFLICT (student_id,subject,topic,learning_objective_key) DO UPDATE SET mastery_score=EXCLUDED.mastery_score,confidence_score=EXCLUDED.confidence_score,retention_score=EXCLUDED.retention_score,attempt_count=EXCLUDED.attempt_count,correct_count=EXCLUDED.correct_count,trend=EXCLUDED.trend,last_practiced_at=EXCLUDED.last_practiced_at,last_mastery_update=EXCLUDED.last_mastery_update,algorithm_version='v1';
    GET DIAGNOSTICS updated = ROW_COUNT;
  END IF;
  RETURN QUERY SELECT inserted=1,updated;
END; $$;

REVOKE ALL ON FUNCTION public.record_adaptive_answer_event_v1(uuid,uuid,integer,text,numeric,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_adaptive_answer_event_v1(uuid,uuid,integer,text,numeric,integer,boolean) TO service_role;
