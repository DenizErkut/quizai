CREATE TABLE IF NOT EXISTS public.exam_question_bank (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  exam_year integer NOT NULL CHECK (exam_year BETWEEN 2018 AND 2100),
  exam_type text NOT NULL CHECK (exam_type IN ('LGS', 'TYT', 'AYT', 'YDT')),
  track text NOT NULL DEFAULT '',
  language text NOT NULL DEFAULT 'Türkçe',
  section_id text NOT NULL,
  subject text NOT NULL,
  grade text NOT NULL,
  curriculum_version text NOT NULL,
  objective text NOT NULL DEFAULT '',
  cognitive_skill text NOT NULL DEFAULT 'application'
    CHECK (cognitive_skill IN ('comprehension', 'application', 'reasoning', 'analysis')),
  difficulty text NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  question jsonb NOT NULL CHECK (jsonb_typeof(question) = 'object' AND length(coalesce(question->>'q', '')) > 0),
  review_status text NOT NULL DEFAULT 'candidate'
    CHECK (review_status IN ('candidate', 'approved', 'rejected', 'retired')),
  validator_model text,
  use_count integer NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  report_count integer NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_question_bank_lookup_idx
ON public.exam_question_bank (
  exam_year, exam_type, track, language, section_id,
  curriculum_version, review_status, use_count, last_used_at
)
WHERE report_count = 0;

ALTER TABLE public.exam_question_bank ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.exam_question_bank FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.exam_question_bank TO service_role;

CREATE OR REPLACE FUNCTION public.increment_exam_question_use(p_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.exam_question_bank
  SET use_count = use_count + 1, last_used_at = now(), updated_at = now()
  WHERE id = p_id AND review_status = 'approved' AND report_count = 0;
$$;

REVOKE ALL ON FUNCTION public.increment_exam_question_use(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_exam_question_use(uuid) TO service_role;

COMMENT ON TABLE public.exam_question_bank IS
  'Server-only, independently validated exam questions. Contains no student answers or personal context.';
