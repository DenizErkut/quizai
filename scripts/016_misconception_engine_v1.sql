-- Misconception Engine v1
-- A single wrong answer is a low-confidence suspicion. Repeated evidence is
-- required before the student state becomes "confirmed".

CREATE TABLE IF NOT EXISTS public.misconception_catalog (
  id text PRIMARY KEY,
  subject text NOT NULL,
  topic text NOT NULL,
  label text NOT NULL CHECK (char_length(label) BETWEEN 5 AND 160),
  source_type text NOT NULL DEFAULT 'ai_distractor',
  verification_status text NOT NULL DEFAULT 'candidate'
    CHECK (verification_status IN ('candidate', 'verified', 'rejected')),
  evidence_count integer NOT NULL DEFAULT 0 CHECK (evidence_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.student_misconceptions (
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  misconception_id text NOT NULL REFERENCES public.misconception_catalog(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  topic text NOT NULL,
  evidence_count integer NOT NULL DEFAULT 1 CHECK (evidence_count > 0),
  confidence_score numeric(5,4) NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 1),
  status text NOT NULL DEFAULT 'suspected'
    CHECK (status IN ('suspected', 'confirmed', 'resolved')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, misconception_id)
);

CREATE INDEX IF NOT EXISTS misconception_catalog_topic_idx
  ON public.misconception_catalog (lower(subject), lower(topic));
CREATE INDEX IF NOT EXISTS student_misconceptions_student_status_idx
  ON public.student_misconceptions (student_id, status, confidence_score DESC);
CREATE INDEX IF NOT EXISTS student_misconceptions_misconception_idx
  ON public.student_misconceptions (misconception_id);

ALTER TABLE public.misconception_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_misconceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS misconception_catalog_authenticated_read ON public.misconception_catalog;
CREATE POLICY misconception_catalog_authenticated_read
  ON public.misconception_catalog FOR SELECT TO authenticated
  USING (verification_status <> 'rejected');

DROP POLICY IF EXISTS student_misconceptions_select_own ON public.student_misconceptions;
CREATE POLICY student_misconceptions_select_own
  ON public.student_misconceptions FOR SELECT TO authenticated
  USING ((select auth.uid()) = student_id);

REVOKE INSERT, UPDATE, DELETE ON public.misconception_catalog FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_misconceptions FROM anon, authenticated;
GRANT SELECT ON public.misconception_catalog, public.student_misconceptions TO authenticated;
GRANT ALL ON public.misconception_catalog, public.student_misconceptions TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_quiz_misconceptions(
  p_student_id uuid,
  p_session_id uuid
) RETURNS TABLE(updated_rows integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.quiz_sessions%ROWTYPE;
  v_updated integer := 0;
BEGIN
  SELECT * INTO v_session FROM public.quiz_sessions
  WHERE id = p_session_id AND user_id = p_student_id AND completed = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Completed quiz session not found for student'; END IF;

  INSERT INTO public.misconception_catalog (id, subject, topic, label)
  SELECT DISTINCT
    a.item->>'misconceptionId',
    coalesce(nullif(q.item->>'subject', ''), 'Genel'),
    v_session.topic,
    left(btrim(a.item->>'misconceptionLabel'), 160)
  FROM jsonb_array_elements(coalesce(v_session.questions::jsonb, '[]'::jsonb))
       WITH ORDINALITY q(item, ordinality)
  JOIN jsonb_array_elements(coalesce(v_session.answers::jsonb, '[]'::jsonb))
       WITH ORDINALITY a(item, ordinality) USING (ordinality)
  WHERE nullif(a.item->>'misconceptionId', '') IS NOT NULL
    AND char_length(btrim(coalesce(a.item->>'misconceptionLabel', ''))) >= 5
  ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    updated_at = now();

  -- Global count is rebuilt from immutable evidence, keeping retries idempotent.
  UPDATE public.misconception_catalog c SET
    evidence_count = counts.n,
    updated_at = now()
  FROM (
    SELECT misconception_id, count(*)::integer n
    FROM public.learning_events
    WHERE misconception_id IS NOT NULL
    GROUP BY misconception_id
  ) counts
  WHERE c.id = counts.misconception_id;

  INSERT INTO public.student_misconceptions (
    student_id, misconception_id, subject, topic, evidence_count,
    confidence_score, status, first_seen_at, last_seen_at, updated_at
  )
  SELECT
    e.student_id, e.misconception_id, max(e.subject), max(e.topic),
    count(*)::integer,
    round((1 - exp(-count(*)::numeric / 3))::numeric, 4),
    CASE WHEN count(*) >= 3 THEN 'confirmed' ELSE 'suspected' END,
    min(e.occurred_at), max(e.occurred_at), now()
  FROM public.learning_events e
  JOIN public.misconception_catalog c ON c.id = e.misconception_id
  WHERE e.student_id = p_student_id AND e.misconception_id IS NOT NULL
  GROUP BY e.student_id, e.misconception_id
  ON CONFLICT (student_id, misconception_id) DO UPDATE SET
    subject = EXCLUDED.subject,
    topic = EXCLUDED.topic,
    evidence_count = EXCLUDED.evidence_count,
    confidence_score = EXCLUDED.confidence_score,
    status = CASE
      WHEN public.student_misconceptions.status = 'resolved' THEN 'resolved'
      ELSE EXCLUDED.status END,
    first_seen_at = EXCLUDED.first_seen_at,
    last_seen_at = EXCLUDED.last_seen_at,
    updated_at = now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- The profile's "known" list must not turn one isolated error into a fact.
  -- Keep its existing compact ID format, but include confirmed evidence only.
  UPDATE public.student_learning_profiles SET
    known_misconceptions = coalesce((
      SELECT jsonb_agg(misconception_id ORDER BY confidence_score DESC)
      FROM public.student_misconceptions
      WHERE student_id = p_student_id AND status = 'confirmed'
    ), '[]'::jsonb),
    updated_at = now()
  WHERE student_id = p_student_id;

  RETURN QUERY SELECT v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_quiz_misconceptions(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_quiz_misconceptions(uuid, uuid) TO service_role;

COMMENT ON TABLE public.misconception_catalog IS
  'AI-proposed distractor semantics; candidate labels require expert verification for curriculum authority.';
COMMENT ON TABLE public.student_misconceptions IS
  'Evidence-backed student misconception state; confirmed only after at least three observations.';
