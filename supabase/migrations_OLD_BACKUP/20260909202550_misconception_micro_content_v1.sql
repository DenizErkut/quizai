-- Expert-gated corrective micro content for verified misconceptions.
CREATE TABLE IF NOT EXISTS public.misconception_micro_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  misconception_id text NOT NULL REFERENCES public.misconception_catalog(id) ON DELETE CASCADE,
  language text NOT NULL DEFAULT 'tr' CHECK (language IN ('tr','en')),
  short_explanation text NOT NULL CHECK (char_length(btrim(short_explanation)) BETWEEN 20 AND 600),
  correction_strategy text NOT NULL CHECK (char_length(btrim(correction_strategy)) BETWEEN 20 AND 800),
  worked_example text NOT NULL CHECK (char_length(btrim(worked_example)) BETWEEN 20 AND 1200),
  check_question jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected','retired')),
  source_kind text NOT NULL DEFAULT 'manual' CHECK (source_kind IN ('manual','ai_draft')),
  ai_provider text,
  ai_model text,
  ai_policy_version text,
  ai_request_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_note text,
  reviewed_at timestamptz,
  published_at timestamptz,
  content_version integer NOT NULL DEFAULT 1 CHECK (content_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT misconception_micro_contents_check_question_shape CHECK (
    jsonb_typeof(check_question)='object'
    AND check_question ? 'question'
    AND check_question ? 'answer'
    AND char_length(btrim(check_question->>'question')) BETWEEN 5 AND 500
    AND char_length(btrim(check_question->>'answer')) BETWEEN 1 AND 500
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS misconception_micro_contents_active_unique
  ON public.misconception_micro_contents(misconception_id,language)
  WHERE status IN ('draft','approved');
CREATE UNIQUE INDEX IF NOT EXISTS misconception_micro_contents_ai_request_unique
  ON public.misconception_micro_contents(ai_request_id) WHERE ai_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS misconception_micro_contents_status_idx
  ON public.misconception_micro_contents(status,updated_at DESC);
CREATE INDEX IF NOT EXISTS misconception_micro_contents_created_by_idx
  ON public.misconception_micro_contents(created_by);
CREATE INDEX IF NOT EXISTS misconception_micro_contents_reviewed_by_idx
  ON public.misconception_micro_contents(reviewed_by) WHERE reviewed_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.misconception_micro_content_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_id uuid NOT NULL REFERENCES public.misconception_micro_contents(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  note text,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS misconception_micro_content_audit_content_idx
  ON public.misconception_micro_content_audit(content_id,created_at DESC);
CREATE INDEX IF NOT EXISTS misconception_micro_content_audit_actor_idx
  ON public.misconception_micro_content_audit(actor_id);

ALTER TABLE public.misconception_micro_contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.misconception_micro_content_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.misconception_micro_contents, public.misconception_micro_content_audit
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.misconception_micro_contents, public.misconception_micro_content_audit TO service_role;
GRANT SELECT ON public.misconception_micro_contents TO authenticated;

CREATE POLICY misconception_micro_contents_student_read ON public.misconception_micro_contents
  FOR SELECT TO authenticated USING (
    status='approved' AND EXISTS (
      SELECT 1 FROM public.student_misconceptions sm
      WHERE sm.student_id=(SELECT auth.uid())
        AND sm.misconception_id=misconception_micro_contents.misconception_id
        AND sm.status='confirmed'
    )
  );

CREATE OR REPLACE FUNCTION public.review_misconception_micro_content_v1(
  p_content_id uuid,p_decision text,p_note text,p_reviewer_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_content public.misconception_micro_contents%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Geçersiz inceleme kararı'; END IF;
  IF p_decision='rejected' AND char_length(btrim(coalesce(p_note,'')))<5 THEN
    RAISE EXCEPTION 'Ret gerekçesi gerekli';
  END IF;
  SELECT * INTO v_content FROM public.misconception_micro_contents WHERE id=p_content_id FOR UPDATE;
  IF NOT FOUND OR v_content.status NOT IN ('draft','rejected') THEN RAISE EXCEPTION 'İncelenebilir içerik bulunamadı'; END IF;
  IF p_decision='approved' AND NOT EXISTS (
    SELECT 1 FROM public.misconception_catalog c
    WHERE c.id=v_content.misconception_id AND c.verification_status='verified'
  ) THEN RAISE EXCEPTION 'Yalnızca doğrulanmış yanılgı içeriği yayımlanabilir'; END IF;
  UPDATE public.misconception_micro_contents SET status=p_decision,reviewed_by=p_reviewer_id,
    review_note=nullif(btrim(p_note),''),reviewed_at=now(),
    published_at=CASE WHEN p_decision='approved' THEN now() ELSE NULL END,updated_at=now()
  WHERE id=p_content_id;
  INSERT INTO public.misconception_micro_content_audit
    (content_id,previous_status,new_status,note,actor_id,snapshot)
  VALUES (p_content_id,v_content.status,p_decision,nullif(btrim(p_note),''),p_reviewer_id,to_jsonb(v_content));
END; $$;

REVOKE ALL ON FUNCTION public.review_misconception_micro_content_v1(uuid,text,text,uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_misconception_micro_content_v1(uuid,text,text,uuid) TO service_role;

COMMENT ON TABLE public.misconception_micro_contents IS
  'Short corrective content for verified misconceptions. AI may draft; only expert-approved rows are student-readable.';
