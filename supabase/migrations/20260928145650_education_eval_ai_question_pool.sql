-- AI-created booklet questions are useful Education Eval cases, but must not
-- contaminate the separately controlled 50-item, teacher-approved MEB metric.
CREATE TABLE IF NOT EXISTS public.education_eval_ai_question_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_resource_id uuid NOT NULL REFERENCES public.exam_resources(id) ON DELETE RESTRICT,
  question_bank_id uuid NOT NULL UNIQUE REFERENCES public.question_bank(id) ON DELETE RESTRICT,
  grade text NOT NULL,
  subject text NOT NULL,
  objective_id uuid REFERENCES public.learning_objective_catalog(id) ON DELETE RESTRICT,
  objective_code text,
  objective_title text,
  question_snapshot jsonb NOT NULL CHECK (jsonb_typeof(question_snapshot) = 'object'),
  answer_key jsonb NOT NULL CHECK (jsonb_typeof(answer_key) = 'object'),
  status text NOT NULL DEFAULT 'needs_objective' CHECK (status IN ('needs_objective', 'ready')),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'needs_objective' AND objective_id IS NULL) OR
         (status = 'ready' AND objective_id IS NOT NULL AND objective_code IS NOT NULL AND objective_title IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS education_eval_ai_items_status_idx
  ON public.education_eval_ai_question_items (status, created_at DESC);
CREATE INDEX IF NOT EXISTS education_eval_ai_items_resource_idx
  ON public.education_eval_ai_question_items (source_resource_id);
CREATE INDEX IF NOT EXISTS education_eval_ai_items_objective_idx
  ON public.education_eval_ai_question_items (objective_id)
  WHERE objective_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS education_eval_ai_items_added_by_idx
  ON public.education_eval_ai_question_items (added_by)
  WHERE added_by IS NOT NULL;

ALTER TABLE public.education_eval_ai_question_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.education_eval_ai_question_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.education_eval_ai_question_items TO service_role;

-- Make already-promoted, independently validated AI booklet questions visible
-- in the separate Education Eval pool. Objective matching is exact and only
-- against the current verified MEB curriculum; unmatched questions await admin mapping.
INSERT INTO public.education_eval_ai_question_items (
  source_resource_id, question_bank_id, grade, subject, objective_id,
  objective_code, objective_title, question_snapshot, answer_key, status
)
SELECT
  r.id,
  q.id,
  r.grade,
  coalesce(r.subject, q.subject_key),
  objective.id,
  objective.objective_code,
  objective.title,
  q.question,
  jsonb_build_object(
    'answerIndex', (q.question->>'ans')::integer,
    'answerText', q.question->'opts'->>((q.question->>'ans')::integer)
  ),
  CASE WHEN objective.id IS NULL THEN 'needs_objective' ELSE 'ready' END
FROM public.question_bank q
JOIN public.exam_resources r ON r.id::text = q.question->>'bookletResourceId'
  LEFT JOIN LATERAL (
  SELECT c.id, c.objective_code, c.title
  FROM public.learning_objective_catalog c
  JOIN public.education_eval_benchmark_sets s
    ON s.code = 'meb-k12-controlled' AND s.version = 1
   AND s.curriculum_version_id = c.curriculum_version_id
  WHERE lower(c.objective_code) = lower(q.question->>'learningObjectiveCode')
    AND c.verification_status = 'verified' AND c.lifecycle_status = 'active' AND c.is_active = true
    AND regexp_replace(lower(c.grade), '[^0-9]', '', 'g') = regexp_replace(lower(r.grade), '[^0-9]', '', 'g')
    AND regexp_replace(translate(lower(c.subject), 'ı', 'i'), '[^a-z0-9]', '', 'g') = regexp_replace(translate(lower(coalesce(r.subject, '')), 'ı', 'i'), '[^a-z0-9]', '', 'g')
  LIMIT 1
) objective ON true
WHERE r.source_type = 'ai'
  AND r.purpose = 'instant_test'
  AND r.review_status = 'approved'
  AND q.source_engine = 'ai_booklet_exact'
  AND q.review_status = 'approved'
  AND q.question->>'sourcePolicy' = 'ai_exact'
  AND jsonb_typeof(q.question->'opts') = 'array'
  AND jsonb_typeof(q.question->'ans') = 'number'
ON CONFLICT (question_bank_id) DO NOTHING;

-- Older approved AI booklet rows predate bookletResourceId metadata. Link only
-- rows whose full question text appears in exactly one approved AI booklet, so
-- an ambiguous duplicate can never be attributed to the wrong source.
WITH matches AS (
  SELECT q.id AS question_bank_id, r.id AS source_resource_id,
         count(*) OVER (PARTITION BY q.id) AS resource_match_count
  FROM public.question_bank q
  JOIN public.exam_resources r
    ON position(lower(q.question->>'q') in lower(coalesce(r.raw_text, ''))) > 0
  WHERE q.source_engine = 'ai_booklet_exact'
    AND q.review_status = 'approved'
    AND q.question->>'sourcePolicy' = 'ai_exact'
    AND char_length(btrim(coalesce(q.question->>'q', ''))) >= 8
    AND r.source_type = 'ai' AND r.purpose = 'instant_test' AND r.review_status = 'approved'
    AND regexp_replace(lower(q.grade_key), '[^0-9]', '', 'g') = regexp_replace(lower(r.grade), '[^0-9]', '', 'g')
    AND regexp_replace(translate(lower(q.subject_key), 'ı', 'i'), '[^a-z0-9]', '', 'g') = regexp_replace(translate(lower(coalesce(r.subject, '')), 'ı', 'i'), '[^a-z0-9]', '', 'g')
), unambiguous AS (
  SELECT question_bank_id, source_resource_id
  FROM matches WHERE resource_match_count = 1
)
INSERT INTO public.education_eval_ai_question_items (
  source_resource_id, question_bank_id, grade, subject, question_snapshot,
  answer_key, status
)
SELECT r.id, q.id, r.grade, coalesce(r.subject, q.subject_key), q.question,
       jsonb_build_object(
         'answerIndex', (q.question->>'ans')::integer,
         'answerText', q.question->'opts'->>((q.question->>'ans')::integer)
       ), 'needs_objective'
FROM unambiguous m
JOIN public.question_bank q ON q.id = m.question_bank_id
JOIN public.exam_resources r ON r.id = m.source_resource_id
WHERE jsonb_typeof(q.question->'opts') = 'array'
  AND jsonb_typeof(q.question->'ans') = 'number'
ON CONFLICT (question_bank_id) DO NOTHING;

COMMENT ON TABLE public.education_eval_ai_question_items IS
  'AI booklet questions available for separate Education Eval experiments. Never included in the teacher-approved 50-item MEB benchmark metric.';
