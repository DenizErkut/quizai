-- Reusable, server-only question bank. Student answers and personal context
-- deliberately remain in quiz_sessions and are never copied here.
CREATE TABLE IF NOT EXISTS public.question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  subject_key text NOT NULL,
  topic_key text NOT NULL,
  grade_key text NOT NULL,
  language_key text NOT NULL,
  question_type text NOT NULL,
  difficulty text NOT NULL,
  question jsonb NOT NULL,
  review_status text NOT NULL DEFAULT 'approved'
    CHECK (review_status IN ('candidate', 'approved', 'rejected', 'retired')),
  quality_score numeric(5,2) NOT NULL DEFAULT 1
    CHECK (quality_score >= 0 AND quality_score <= 1),
  source_session_id uuid REFERENCES public.quiz_sessions(id) ON DELETE SET NULL,
  source_engine text,
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  report_count integer NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(question) = 'object'),
  CHECK (length(coalesce(question->>'q', '')) > 0)
);

CREATE INDEX IF NOT EXISTS question_bank_lookup_idx
  ON public.question_bank (
    subject_key, topic_key, grade_key, language_key,
    question_type, difficulty, review_status, use_count, last_used_at
  );

CREATE INDEX IF NOT EXISTS question_bank_source_session_idx
  ON public.question_bank (source_session_id)
  WHERE source_session_id IS NOT NULL;

ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;

-- This table is consumed only by authenticated server routes through the
-- service role. It must not become a client-side answer-key endpoint.
REVOKE ALL ON TABLE public.question_bank FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.question_bank TO service_role;

CREATE OR REPLACE FUNCTION public.mark_question_bank_used(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.question_bank
  SET use_count = use_count + 1,
      last_used_at = now(),
      updated_at = now()
  WHERE id = ANY(p_ids)
    AND review_status = 'approved'
    AND report_count = 0;
$$;

REVOKE ALL ON FUNCTION public.mark_question_bank_used(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_question_bank_used(uuid[]) TO service_role;

COMMENT ON TABLE public.question_bank IS
  'Server-only reusable questions. Never contains student answers or personal prompt context.';
