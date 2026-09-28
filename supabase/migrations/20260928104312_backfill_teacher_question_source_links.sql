-- Older exact teacher-booklet questions were promoted before the bank rows
-- carried bookletResourceId. Backfill provenance only where exactly one
-- approved teacher booklet exists for the same grade/subject and has stored
-- publication evidence. Ambiguous or evidence-free rows remain unlinked.
WITH eligible_resources AS (
  SELECT id, btrim(grade) AS grade, lower(btrim(subject)) AS subject,
         count(*) OVER (PARTITION BY btrim(grade), lower(btrim(subject))) AS match_count
  FROM public.exam_resources
  WHERE source_type = 'teacher'
    AND purpose = 'instant_test'
    AND review_status = 'approved'
    AND cardinality(publication_evidence_paths) > 0
), unique_resources AS (
  SELECT id, grade, subject FROM eligible_resources WHERE match_count = 1
)
UPDATE public.question_bank q
SET question = jsonb_set(q.question, '{bookletResourceId}', to_jsonb(r.id::text), true),
    updated_at = now()
FROM unique_resources r
WHERE q.source_engine = 'teacher_booklet_exact'
  AND q.review_status = 'approved'
  AND q.question->>'sourcePolicy' = 'teacher_exact'
  AND nullif(q.question->>'bookletResourceId', '') IS NULL
  AND btrim(regexp_replace(q.grade_key, '(ortaokul|ilkokul|lise|sinif)', '', 'g')) = r.grade
  AND lower(btrim(q.subject_key)) = r.subject;
