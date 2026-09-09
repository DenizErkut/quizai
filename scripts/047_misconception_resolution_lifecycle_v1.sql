-- Misconception resolved/reopened lifecycle v1
ALTER TABLE public.student_misconceptions ADD COLUMN IF NOT EXISTS counter_evidence_count integer NOT NULL DEFAULT 0 CHECK(counter_evidence_count>=0);
ALTER TABLE public.student_misconceptions ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.student_misconceptions ADD COLUMN IF NOT EXISTS reopened_at timestamptz;

CREATE TABLE IF NOT EXISTS public.misconception_counter_evidence (
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  misconception_id text NOT NULL REFERENCES public.misconception_catalog(id) ON DELETE RESTRICT,
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_index integer NOT NULL CHECK(question_index>=0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(student_id,misconception_id,session_id,question_index)
);
CREATE INDEX IF NOT EXISTS misconception_counter_student_idx ON public.misconception_counter_evidence(student_id,misconception_id,occurred_at DESC);
ALTER TABLE public.misconception_counter_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.misconception_counter_evidence FROM anon,authenticated;
GRANT ALL ON public.misconception_counter_evidence TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_misconception_resolution(p_student_id uuid,p_session_id uuid)
RETURNS TABLE(resolved_rows integer,reopened_rows integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_resolved integer:=0; v_reopened integer:=0;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.quiz_sessions WHERE id=p_session_id AND user_id=p_student_id AND completed=true)
    THEN RAISE EXCEPTION 'Completed quiz session not found for student'; END IF;

  INSERT INTO public.misconception_counter_evidence(student_id,misconception_id,session_id,question_index,occurred_at)
  SELECT p_student_id,public.canonical_misconception_id(counter.value),p_session_id,a.ordinality::integer-1,now()
  FROM public.quiz_sessions qs
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(qs.answers::jsonb,'[]'::jsonb)) WITH ORDINALITY a(item,ordinality)
  CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(a.item->'counterMisconceptionIds','[]'::jsonb)) counter(value)
  JOIN public.student_misconceptions sm ON sm.student_id=p_student_id
    AND sm.misconception_id=public.canonical_misconception_id(counter.value)
  JOIN public.misconception_catalog c ON c.id=sm.misconception_id AND c.verification_status='verified'
  WHERE qs.id=p_session_id AND qs.user_id=p_student_id AND coalesce((a.item->>'correct')::boolean,false)
  ON CONFLICT DO NOTHING;

  -- A new wrong observation after resolution reopens the diagnosis.
  UPDATE public.student_misconceptions sm SET status='confirmed',reopened_at=now(),resolved_at=NULL,
    counter_evidence_count=0,updated_at=now()
  WHERE sm.student_id=p_student_id AND sm.status='resolved' AND EXISTS(
    SELECT 1 FROM public.learning_events e WHERE e.student_id=sm.student_id
      AND public.canonical_misconception_id(e.misconception_id)=sm.misconception_id
      AND e.occurred_at>sm.resolved_at);
  GET DIAGNOSTICS v_reopened=ROW_COUNT;

  WITH counters AS (
    SELECT sm.student_id,sm.misconception_id,count(distinct ce.session_id)::integer n,max(ce.occurred_at) latest
    FROM public.student_misconceptions sm JOIN public.misconception_counter_evidence ce
      ON ce.student_id=sm.student_id AND ce.misconception_id=sm.misconception_id
    WHERE sm.student_id=p_student_id AND ce.occurred_at>sm.last_seen_at
    GROUP BY sm.student_id,sm.misconception_id
  )
  UPDATE public.student_misconceptions sm SET counter_evidence_count=c.n,
    status=CASE WHEN sm.status='confirmed' AND c.n>=2 THEN 'resolved' ELSE sm.status END,
    resolved_at=CASE WHEN sm.status='confirmed' AND c.n>=2 THEN c.latest ELSE sm.resolved_at END,updated_at=now()
  FROM counters c WHERE sm.student_id=c.student_id AND sm.misconception_id=c.misconception_id;
  GET DIAGNOSTICS v_resolved=ROW_COUNT;

  UPDATE public.student_learning_profiles p SET known_misconceptions=coalesce((
    SELECT jsonb_agg(sm.misconception_id ORDER BY sm.confidence_score DESC)
    FROM public.student_misconceptions sm JOIN public.misconception_catalog c ON c.id=sm.misconception_id
    WHERE sm.student_id=p.student_id AND sm.status='confirmed' AND c.verification_status='verified'
  ),'[]'::jsonb),updated_at=now() WHERE p.student_id=p_student_id;
  RETURN QUERY SELECT v_resolved,v_reopened;
END; $$;
REVOKE ALL ON FUNCTION public.refresh_misconception_resolution(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_misconception_resolution(uuid,uuid) TO service_role;
