-- Misconception cluster proposals v1
-- Per-question hash ids (mc_*) never reach the "≥3 observations → confirmed"
-- rule. Proposed clusters (same student + subject + topic, same underlying
-- error) are reviewed by an expert; approval creates ONE verified canonical
-- entry and merges the members through merge_misconception_alias, which
-- already moves evidence and recomputes suspected/confirmed status.
CREATE TABLE IF NOT EXISTS public.misconception_cluster_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  topic text NOT NULL,
  canonical_label text NOT NULL CHECK (char_length(canonical_label) BETWEEN 5 AND 160),
  member_ids text[] NOT NULL CHECK (cardinality(member_ids) >= 3),
  member_key text NOT NULL,
  rationale text,
  model text,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
  canonical_id text REFERENCES public.misconception_catalog(id) ON DELETE SET NULL,
  review_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS misconception_cluster_proposals_open_key
  ON public.misconception_cluster_proposals (student_id, member_key) WHERE status = 'proposed';
CREATE INDEX IF NOT EXISTS misconception_cluster_proposals_status_idx
  ON public.misconception_cluster_proposals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS misconception_cluster_proposals_canonical_idx
  ON public.misconception_cluster_proposals (canonical_id);
CREATE INDEX IF NOT EXISTS misconception_cluster_proposals_reviewer_idx
  ON public.misconception_cluster_proposals (reviewed_by);
ALTER TABLE public.misconception_cluster_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.misconception_cluster_proposals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.misconception_cluster_proposals TO service_role;

-- p_member_ids lets the expert drop members from the proposal (never add).
CREATE OR REPLACE FUNCTION public.approve_misconception_cluster(
  p_proposal_id uuid, p_canonical_label text, p_member_ids text[], p_reason text, p_reviewer_id uuid
) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_prop public.misconception_cluster_proposals%ROWTYPE;
  v_canonical text;
  v_member text;
  v_label text := left(btrim(coalesce(p_canonical_label, '')), 160);
BEGIN
  IF char_length(btrim(coalesce(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'Expert rationale required (min 10 chars)'; END IF;
  IF char_length(v_label) < 5 THEN RAISE EXCEPTION 'Canonical label too short'; END IF;
  SELECT * INTO v_prop FROM public.misconception_cluster_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
  IF v_prop.status <> 'proposed' THEN RAISE EXCEPTION 'Proposal already reviewed'; END IF;
  IF cardinality(coalesce(p_member_ids, '{}')) < 3 THEN RAISE EXCEPTION 'A cluster needs at least 3 members'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_member_ids) m WHERE m <> ALL (v_prop.member_ids)) THEN
    RAISE EXCEPTION 'Members must come from the proposal';
  END IF;
  IF (SELECT count(DISTINCT m) FROM unnest(p_member_ids) m) <> cardinality(p_member_ids) THEN RAISE EXCEPTION 'Duplicate members'; END IF;
  -- Every member must still be this student's own, unaliased row; a shared id would leak evidence across students.
  IF (SELECT count(*) FROM public.student_misconceptions
        WHERE student_id = v_prop.student_id AND misconception_id = ANY (p_member_ids)) <> cardinality(p_member_ids)
     OR EXISTS (SELECT 1 FROM public.student_misconceptions
        WHERE student_id <> v_prop.student_id AND misconception_id = ANY (p_member_ids))
     OR EXISTS (SELECT 1 FROM public.misconception_aliases WHERE alias_id = ANY (p_member_ids) OR canonical_id = ANY (p_member_ids)) THEN
    RAISE EXCEPTION 'Members changed since the proposal; regenerate it';
  END IF;

  v_canonical := 'mcc_' || md5(p_proposal_id::text);
  INSERT INTO public.misconception_catalog (id, subject, topic, label, source_type, verification_status,
    evidence_count, review_note, reviewed_by, reviewed_at)
  SELECT v_canonical, v_prop.subject, v_prop.topic, v_label, 'expert_cluster', 'verified',
    coalesce(sum(sm.evidence_count), 0), btrim(p_reason), p_reviewer_id, now()
  FROM public.student_misconceptions sm WHERE sm.student_id = v_prop.student_id AND sm.misconception_id = ANY (p_member_ids);
  INSERT INTO public.misconception_review_audit (misconception_id, previous_status, new_status, review_note, reviewed_by)
  VALUES (v_canonical, 'candidate', 'verified', btrim(p_reason), p_reviewer_id);

  FOREACH v_member IN ARRAY p_member_ids LOOP
    PERFORM public.merge_misconception_alias(v_member, v_canonical, 'Cluster: ' || left(btrim(p_reason), 460), p_reviewer_id);
  END LOOP;

  UPDATE public.misconception_cluster_proposals SET status = 'approved', canonical_id = v_canonical,
    canonical_label = v_label, review_note = btrim(p_reason), reviewed_by = p_reviewer_id, reviewed_at = now()
  WHERE id = p_proposal_id;
  RETURN v_canonical;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_misconception_cluster(
  p_proposal_id uuid, p_reason text, p_reviewer_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF char_length(btrim(coalesce(p_reason, ''))) < 10 THEN RAISE EXCEPTION 'Expert rationale required (min 10 chars)'; END IF;
  UPDATE public.misconception_cluster_proposals SET status = 'rejected', review_note = btrim(p_reason),
    reviewed_by = p_reviewer_id, reviewed_at = now() WHERE id = p_proposal_id AND status = 'proposed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Open proposal not found'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.approve_misconception_cluster(uuid, text, text[], text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_misconception_cluster(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_misconception_cluster(uuid, text, text[], text, uuid),
  public.reject_misconception_cluster(uuid, text, uuid) TO service_role;
COMMENT ON TABLE public.misconception_cluster_proposals IS
  'AI-proposed semantic clusters of one student''s misconception labels; only an expert approval merges them.';
