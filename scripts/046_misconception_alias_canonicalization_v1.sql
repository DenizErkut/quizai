-- Misconception Alias & Canonicalization v1
CREATE TABLE IF NOT EXISTS public.misconception_aliases (
  alias_id text PRIMARY KEY REFERENCES public.misconception_catalog(id) ON DELETE CASCADE,
  canonical_id text NOT NULL REFERENCES public.misconception_catalog(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (alias_id <> canonical_id)
);
CREATE INDEX IF NOT EXISTS misconception_aliases_canonical_idx ON public.misconception_aliases(canonical_id);
ALTER TABLE public.misconception_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.misconception_aliases FROM anon, authenticated;
GRANT ALL ON public.misconception_aliases TO service_role;

CREATE OR REPLACE FUNCTION public.canonical_misconception_id(p_id text)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT coalesce((SELECT canonical_id FROM public.misconception_aliases WHERE alias_id = p_id), p_id)
$$;

CREATE OR REPLACE FUNCTION public.merge_misconception_alias(
  p_alias_id text, p_canonical_id text, p_reason text, p_reviewer_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_canonical_status text; v_alias_status text;
BEGIN
  IF p_alias_id = p_canonical_id THEN RAISE EXCEPTION 'Alias and canonical item must differ'; END IF;
  IF char_length(btrim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Merge reason required'; END IF;
  SELECT verification_status INTO v_alias_status FROM public.misconception_catalog WHERE id=p_alias_id FOR UPDATE;
  IF v_alias_status IS NULL THEN RAISE EXCEPTION 'Alias item not found'; END IF;
  SELECT verification_status INTO v_canonical_status FROM public.misconception_catalog WHERE id = p_canonical_id FOR UPDATE;
  IF v_canonical_status IS NULL THEN RAISE EXCEPTION 'Canonical item not found'; END IF;
  IF v_canonical_status <> 'verified' THEN RAISE EXCEPTION 'Canonical item must be verified'; END IF;
  IF EXISTS (SELECT 1 FROM public.misconception_aliases WHERE alias_id = p_canonical_id) THEN RAISE EXCEPTION 'Alias chains are not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM public.misconception_aliases WHERE canonical_id = p_alias_id) THEN RAISE EXCEPTION 'An existing canonical item cannot become an alias'; END IF;

  INSERT INTO public.misconception_aliases(alias_id, canonical_id, reason, created_by)
  VALUES (p_alias_id, p_canonical_id, btrim(p_reason), p_reviewer_id)
  ON CONFLICT (alias_id) DO UPDATE SET canonical_id=excluded.canonical_id, reason=excluded.reason,
    created_by=excluded.created_by, created_at=now();

  INSERT INTO public.student_misconceptions(student_id,misconception_id,subject,topic,evidence_count,
    confidence_score,status,first_seen_at,last_seen_at,updated_at)
  SELECT student_id,p_canonical_id,subject,topic,evidence_count,confidence_score,status,first_seen_at,last_seen_at,now()
  FROM public.student_misconceptions WHERE misconception_id=p_alias_id
  ON CONFLICT (student_id,misconception_id) DO UPDATE SET
    evidence_count=public.student_misconceptions.evidence_count+excluded.evidence_count,
    confidence_score=round((1-exp(-(public.student_misconceptions.evidence_count+excluded.evidence_count)::numeric/3))::numeric,4),
    status=CASE WHEN public.student_misconceptions.status='resolved' THEN 'resolved'
      WHEN public.student_misconceptions.evidence_count+excluded.evidence_count>=3 THEN 'confirmed' ELSE 'suspected' END,
    first_seen_at=least(public.student_misconceptions.first_seen_at,excluded.first_seen_at),
    last_seen_at=greatest(public.student_misconceptions.last_seen_at,excluded.last_seen_at),updated_at=now();
  DELETE FROM public.student_misconceptions WHERE misconception_id=p_alias_id;
  DELETE FROM public.student_recommendations
    WHERE action_type='misconception_review' AND evidence->>'misconceptionId'=p_alias_id;
  UPDATE public.misconception_catalog SET verification_status='rejected',
    review_note='Alias → '||p_canonical_id||': '||btrim(p_reason), reviewed_by=p_reviewer_id,
    reviewed_at=now(),updated_at=now() WHERE id=p_alias_id;
  INSERT INTO public.misconception_review_audit
    (misconception_id,previous_status,new_status,review_note,reviewed_by)
  VALUES (p_alias_id,v_alias_status,
    'rejected','Alias → '||p_canonical_id||': '||btrim(p_reason),p_reviewer_id);
  UPDATE public.student_learning_profiles p SET known_misconceptions=coalesce((
    SELECT jsonb_agg(sm.misconception_id ORDER BY sm.confidence_score DESC)
    FROM public.student_misconceptions sm JOIN public.misconception_catalog c ON c.id=sm.misconception_id
    WHERE sm.student_id=p.student_id AND sm.status='confirmed' AND c.verification_status='verified'
  ),'[]'::jsonb),updated_at=now()
  WHERE EXISTS (SELECT 1 FROM public.student_misconceptions sm
    WHERE sm.student_id=p.student_id AND sm.misconception_id=p_canonical_id);
END; $$;

-- New evidence is canonicalized before it becomes immutable.
CREATE OR REPLACE FUNCTION public.canonicalize_learning_event_misconception()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.misconception_id IS NOT NULL THEN
    NEW.misconception_id := public.canonical_misconception_id(NEW.misconception_id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS learning_events_misconception_canonicalize ON public.learning_events;
CREATE TRIGGER learning_events_misconception_canonicalize
BEFORE INSERT ON public.learning_events FOR EACH ROW EXECUTE FUNCTION public.canonicalize_learning_event_misconception();

REVOKE ALL ON FUNCTION public.canonical_misconception_id(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.merge_misconception_alias(text,text,text,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.canonicalize_learning_event_misconception() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_misconception_id(text), public.merge_misconception_alias(text,text,text,uuid) TO service_role;
