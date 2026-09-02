-- Aşama 0.5 — Historical Learning Event Backfill & Taxonomy Normalization
-- Additive and retry-safe. Raw quiz_sessions are never rewritten.

CREATE TABLE IF NOT EXISTS public.learning_topic_aliases (
  alias_key text PRIMARY KEY,
  canonical_topic text NOT NULL CHECK (char_length(btrim(canonical_topic)) > 0),
  canonical_subject text NOT NULL DEFAULT 'Genel',
  review_status text NOT NULL DEFAULT 'candidate'
    CHECK (review_status IN ('candidate', 'reviewed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.learning_topic_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_topic_aliases FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_topic_aliases TO service_role;

CREATE OR REPLACE FUNCTION public.learning_dimension_key(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
RETURN lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'));

REVOKE ALL ON FUNCTION public.learning_dimension_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.learning_dimension_key(text) TO service_role;

INSERT INTO public.learning_topic_aliases
  (alias_key, canonical_topic, canonical_subject, review_status, notes)
VALUES
  (public.learning_dimension_key('Allah İnancı'), 'Allah İnancı', 'Din Kültürü ve Ahlak Bilgisi', 'reviewed', 'Açık ders eşlemesi'),
  (public.learning_dimension_key('Allah inancı ve evren'), 'Allah İnancı ve Evren', 'Din Kültürü ve Ahlak Bilgisi', 'reviewed', 'Ayrı konu olarak korunur'),
  (public.learning_dimension_key('Farklı Dünyalar'), 'Farklı Dünyalar', 'Din Kültürü ve Ahlak Bilgisi', 'candidate', 'Ders eşlemesi içerik ekibi tarafından doğrulanmalı'),
  (public.learning_dimension_key('Kuvveti Tanıyalım'), 'Kuvveti Tanıyalım', 'Fen Bilimleri', 'reviewed', 'Açık ders eşlemesi'),
  (public.learning_dimension_key('Işığın Dünyası'), 'Işığın Dünyası', 'Fen Bilimleri', 'reviewed', 'Açık ders eşlemesi'),
  (public.learning_dimension_key('Sözcükte anlam'), 'Sözcükte Anlam', 'Türkçe', 'reviewed', 'Yazım normalizasyonu'),
  (public.learning_dimension_key('Present simple tense'), 'Present Simple Tense', 'İngilizce', 'reviewed', 'Yazım normalizasyonu'),
  (public.learning_dimension_key('Vocabulary: family'), 'Vocabulary: Family', 'İngilizce', 'reviewed', 'Yazım normalizasyonu'),
  (public.learning_dimension_key('Yaşayan Demokrasimiz'), 'Yaşayan Demokrasimiz', 'Sosyal Bilgiler', 'reviewed', 'Harf büyüklüğü varyantlarını birleştirir'),
  (public.learning_dimension_key('Teknoloji ve Sosyal Bilimler'), 'Teknoloji ve Sosyal Bilimler', 'Sosyal Bilgiler', 'reviewed', 'Harf büyüklüğü varyantlarını birleştirir'),
  (public.learning_dimension_key('Bir Kahraman Doğuyor'), 'Bir Kahraman Doğuyor', 'T.C. İnkılap Tarihi ve Atatürkçülük', 'reviewed', 'Harf büyüklüğü varyantlarını birleştirir'),
  (public.learning_dimension_key('Birlikte Yaşamak'), 'Birlikte Yaşamak', 'Sosyal Bilgiler', 'reviewed', 'Harf büyüklüğü varyantlarını birleştirir'),
  (public.learning_dimension_key('Denklemler'), 'Denklemler', 'Matematik', 'reviewed', 'Harf büyüklüğü varyantlarını birleştirir'),
  (public.learning_dimension_key('Geometrik Şekiller'), 'Geometrik Şekiller', 'Matematik', 'reviewed', 'Harf büyüklüğü varyantlarını birleştirir')
ON CONFLICT (alias_key) DO UPDATE SET
  canonical_topic = EXCLUDED.canonical_topic,
  canonical_subject = EXCLUDED.canonical_subject,
  review_status = EXCLUDED.review_status,
  notes = EXCLUDED.notes,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.resolve_learning_dimension(
  p_topic text,
  p_subject text DEFAULT NULL
) RETURNS TABLE(subject text, topic text)
LANGUAGE sql STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    CASE
      WHEN nullif(btrim(p_subject), '') IS NOT NULL
        AND public.learning_dimension_key(p_subject) <> 'genel'
        THEN regexp_replace(btrim(p_subject), '\s+', ' ', 'g')
      ELSE coalesce(a.canonical_subject, 'Genel')
    END,
    coalesce(a.canonical_topic, regexp_replace(btrim(p_topic), '\s+', ' ', 'g'))
  FROM (SELECT 1) seed
  LEFT JOIN public.learning_topic_aliases a
    ON a.alias_key = public.learning_dimension_key(p_topic);
$$;

REVOKE ALL ON FUNCTION public.resolve_learning_dimension(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_learning_dimension(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.normalize_learning_event_dimension()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_subject text; v_topic text;
BEGIN
  SELECT d.subject, d.topic INTO v_subject, v_topic
  FROM public.resolve_learning_dimension(NEW.topic, NEW.subject) d;

  IF NEW.topic IS DISTINCT FROM v_topic THEN
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('original_topic', NEW.topic);
  END IF;
  IF NEW.subject IS DISTINCT FROM v_subject THEN
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('original_subject', NEW.subject);
  END IF;
  NEW.topic := v_topic;
  NEW.subject := v_subject;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_learning_event_dimension() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS learning_events_normalize_dimension ON public.learning_events;
CREATE TRIGGER learning_events_normalize_dimension
BEFORE INSERT ON public.learning_events
FOR EACH ROW EXECUTE FUNCTION public.normalize_learning_event_dimension();

CREATE OR REPLACE FUNCTION public.rebuild_student_mastery_v1(p_student_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_rows integer := 0;
BEGIN
  DELETE FROM public.student_mastery WHERE student_id = p_student_id;

  WITH stats AS (
    SELECT student_id, subject, topic,
      count(*)::integer attempts,
      count(*) FILTER (WHERE result = 'correct')::integer corrects,
      sum((score / max_score) * difficulty_weight) weighted_correct,
      sum(difficulty_weight) total_weight,
      max(occurred_at) last_practiced,
      (array_agg(misconception_id ORDER BY occurred_at DESC)
        FILTER (WHERE misconception_id IS NOT NULL))[1] misconception,
      avg(score / max_score) FILTER (WHERE occurred_at >= now() - interval '30 days') recent_rate,
      avg(score / max_score) FILTER (WHERE occurred_at < now() - interval '30 days'
        AND occurred_at >= now() - interval '60 days') previous_rate
    FROM public.learning_events
    WHERE student_id = p_student_id
    GROUP BY student_id, subject, topic
  ), calculated AS (
    SELECT *, round(100 * ((weighted_correct + 1.8) / (total_weight + 3)), 2) mastery,
      round((1 - exp(-attempts::numeric / 8))::numeric, 4) confidence
    FROM stats
  )
  INSERT INTO public.student_mastery (
    student_id, subject, topic, learning_objective_id, learning_objective_key,
    mastery_score, confidence_score, retention_score, attempt_count, correct_count,
    trend, last_practiced_at, last_mastery_update, primary_misconception_id, algorithm_version
  )
  SELECT student_id, subject, topic, NULL, '', mastery, confidence,
    round(greatest(0, 100 * exp(-extract(epoch FROM (now() - last_practiced)) / 86400 /
      CASE WHEN mastery >= 80 THEN 30 WHEN mastery >= 50 THEN 14 ELSE 7 END))::numeric, 2),
    attempts, corrects,
    CASE WHEN previous_rate IS NULL OR recent_rate IS NULL THEN 'stable'
      WHEN recent_rate > previous_rate + 0.10 THEN 'improving'
      WHEN recent_rate < previous_rate - 0.10 THEN 'declining' ELSE 'stable' END,
    last_practiced, now(), misconception, 'v1'
  FROM calculated;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_student_mastery_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_student_mastery_v1(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rebuild_mastery_after_learning_event_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_student uuid;
BEGIN
  FOR v_student IN SELECT DISTINCT student_id FROM inserted_learning_events
  LOOP
    PERFORM public.rebuild_student_mastery_v1(v_student);
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_mastery_after_learning_event_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS learning_events_rebuild_mastery ON public.learning_events;
CREATE TRIGGER learning_events_rebuild_mastery
AFTER INSERT ON public.learning_events
REFERENCING NEW TABLE AS inserted_learning_events
FOR EACH STATEMENT EXECUTE FUNCTION public.rebuild_mastery_after_learning_event_insert();

CREATE OR REPLACE FUNCTION public.backfill_quiz_learning_events(p_batch_size integer DEFAULT 100)
RETURNS TABLE(processed_sessions integer, inserted_events integer)
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_sessions integer := 0; v_events integer := 0; v_student uuid;
BEGIN
  IF p_batch_size < 1 OR p_batch_size > 1000 THEN
    RAISE EXCEPTION 'p_batch_size must be between 1 and 1000';
  END IF;

  WITH candidates AS (
    SELECT qs.* FROM public.quiz_sessions qs
    WHERE qs.completed = true
      AND jsonb_typeof(qs.questions::jsonb) = 'array'
      AND jsonb_typeof(qs.answers::jsonb) = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM public.learning_events e
        WHERE e.student_id = qs.user_id AND e.source_type = 'quiz_session' AND e.source_id = qs.id
      )
    ORDER BY qs.created_at, qs.id
    LIMIT p_batch_size
  ), inserted AS (
    INSERT INTO public.learning_events (
      student_id, subject, grade, topic, learning_objective_id, question_id,
      question_index, question_type, difficulty, difficulty_weight, result,
      score, max_score, response_time_ms, attempt_count, hint_used,
      misconception_id, source_type, source_id, assignment_id, occurred_at, metadata
    )
    SELECT c.user_id, d.subject, c.grade, d.topic,
      nullif(coalesce(q.item->>'learningObjectiveId', q.item->>'learning_objective_id'), ''),
      nullif(coalesce(q.item->>'id', q.item->>'questionId'), ''),
      q.ordinality::integer - 1,
      nullif(coalesce(q.item->>'type', c.question_type), ''),
      nullif(coalesce(q.item->>'difficulty', q.item->>'difficultyLevel'), ''),
      CASE lower(coalesce(q.item->>'difficulty', q.item->>'difficultyLevel', 'normal'))
        WHEN 'kolay' THEN 0.80 WHEN 'easy' THEN 0.80
        WHEN 'zor' THEN 1.20 WHEN 'hard' THEN 1.20
        WHEN 'cok zor' THEN 1.40 WHEN 'çok zor' THEN 1.40 WHEN 'very hard' THEN 1.40
        ELSE 1.00 END,
      CASE WHEN coalesce((a.item->>'userAns')::integer, -1) = -1 THEN 'skipped'
        WHEN coalesce((a.item->>'correct')::boolean, false) THEN 'correct' ELSE 'incorrect' END,
      CASE WHEN coalesce((a.item->>'correct')::boolean, false) THEN 1 ELSE 0 END,
      1, CASE WHEN (a.item->>'timeMs') ~ '^[0-9]+$' THEN (a.item->>'timeMs')::integer END,
      1, coalesce((a.item->>'hintUsed')::boolean, false), nullif(a.item->>'misconceptionId', ''),
      'quiz_session', c.id, NULL, c.created_at,
      jsonb_build_object('schema_version', 1, 'backfilled', true,
        'original_topic', c.topic, 'backfill_version', 'v1')
    FROM candidates c
    CROSS JOIN LATERAL jsonb_array_elements(c.questions::jsonb) WITH ORDINALITY q(item, ordinality)
    JOIN LATERAL jsonb_array_elements(c.answers::jsonb) WITH ORDINALITY a(item, ordinality)
      ON a.ordinality = q.ordinality
    CROSS JOIN LATERAL public.resolve_learning_dimension(
      c.topic, nullif(q.item->>'subject', '')
    ) d
    ON CONFLICT (student_id, source_type, source_id, question_index) DO NOTHING
    RETURNING student_id
  ), affected AS (SELECT DISTINCT student_id FROM inserted)
  SELECT count(*), coalesce((SELECT count(*) FROM inserted), 0)
    INTO v_sessions, v_events FROM candidates;

  FOR v_student IN
    SELECT DISTINCT qs.user_id FROM public.quiz_sessions qs
    WHERE EXISTS (SELECT 1 FROM public.learning_events e
      WHERE e.source_id = qs.id AND e.metadata->>'backfill_version' = 'v1')
  LOOP
    PERFORM public.rebuild_student_mastery_v1(v_student);
    PERFORM public.refresh_student_learning_profile(v_student);
    PERFORM public.refresh_student_recommendations(v_student);
  END LOOP;

  RETURN QUERY SELECT v_sessions, v_events;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_quiz_learning_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_quiz_learning_events(integer) TO service_role;

COMMENT ON TABLE public.learning_topic_aliases IS
  'Curated aliases for canonical learning topic and subject dimensions; raw source labels remain in event metadata.';
COMMENT ON FUNCTION public.backfill_quiz_learning_events(integer) IS
  'Projects historical completed quizzes in bounded, idempotent batches and rebuilds affected derived state.';
