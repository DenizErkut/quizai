-- Misconception expert review v1
ALTER TABLE public.misconception_catalog ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE public.misconception_catalog ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.misconception_catalog ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.misconception_review_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  misconception_id text NOT NULL REFERENCES public.misconception_catalog(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  new_status text NOT NULL CHECK (new_status IN ('verified', 'rejected')),
  review_note text,
  reviewed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS misconception_review_audit_item_idx
  ON public.misconception_review_audit (misconception_id, reviewed_at DESC);
ALTER TABLE public.misconception_review_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.misconception_review_audit FROM anon, authenticated;
GRANT ALL ON public.misconception_review_audit TO service_role;

CREATE OR REPLACE FUNCTION public.review_misconception(
  p_misconception_id text, p_decision text, p_note text, p_reviewer_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_previous text;
BEGIN
  IF p_decision NOT IN ('verified', 'rejected') THEN RAISE EXCEPTION 'Invalid review decision'; END IF;
  IF p_decision = 'rejected' AND nullif(btrim(coalesce(p_note, '')), '') IS NULL THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
  SELECT verification_status INTO v_previous FROM public.misconception_catalog
    WHERE id = p_misconception_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Misconception not found'; END IF;
  UPDATE public.misconception_catalog SET verification_status = p_decision,
    review_note = nullif(btrim(p_note), ''), reviewed_by = p_reviewer_id, reviewed_at = now(), updated_at = now()
    WHERE id = p_misconception_id;
  INSERT INTO public.misconception_review_audit
    (misconception_id, previous_status, new_status, review_note, reviewed_by)
  VALUES (p_misconception_id, v_previous, p_decision, nullif(btrim(p_note), ''), p_reviewer_id);
END; $$;
REVOKE ALL ON FUNCTION public.review_misconception(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_misconception(text, text, text, uuid) TO service_role;

-- Only expert-verified catalog entries may become actionable recommendations.
CREATE OR REPLACE FUNCTION public.guard_verified_misconception_recommendation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF NEW.action_type = 'misconception_review' AND NOT EXISTS (
    SELECT 1 FROM public.misconception_catalog c
    WHERE c.id = NEW.evidence->>'misconceptionId' AND c.verification_status = 'verified'
  ) THEN RETURN NULL; END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS recommendations_verified_misconception_guard ON public.student_recommendations;
CREATE TRIGGER recommendations_verified_misconception_guard
BEFORE INSERT OR UPDATE ON public.student_recommendations
FOR EACH ROW EXECUTE FUNCTION public.guard_verified_misconception_recommendation();

DELETE FROM public.student_recommendations r
WHERE r.action_type = 'misconception_review' AND NOT EXISTS (
  SELECT 1 FROM public.misconception_catalog c
  WHERE c.id = r.evidence->>'misconceptionId' AND c.verification_status = 'verified'
);

UPDATE public.student_learning_profiles p SET known_misconceptions = coalesce((
  SELECT jsonb_agg(value)
  FROM jsonb_array_elements_text(coalesce(p.known_misconceptions, '[]'::jsonb)) AS item(value)
  JOIN public.misconception_catalog c ON c.id = item.value AND c.verification_status = 'verified'
), '[]'::jsonb), updated_at = now();

CREATE OR REPLACE FUNCTION public.guard_verified_profile_misconceptions()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  NEW.known_misconceptions := coalesce((
    SELECT jsonb_agg(item.value)
    FROM jsonb_array_elements_text(coalesce(NEW.known_misconceptions, '[]'::jsonb)) AS item(value)
    JOIN public.misconception_catalog c ON c.id = item.value AND c.verification_status = 'verified'
  ), '[]'::jsonb);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_verified_misconception_guard ON public.student_learning_profiles;
CREATE TRIGGER profiles_verified_misconception_guard
BEFORE INSERT OR UPDATE OF known_misconceptions ON public.student_learning_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_verified_profile_misconceptions();

REVOKE ALL ON FUNCTION public.guard_verified_misconception_recommendation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_verified_profile_misconceptions() FROM PUBLIC, anon, authenticated;
