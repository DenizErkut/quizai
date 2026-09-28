-- Exact booklet imports should be grouped under the unit selected by the
-- uploader; question.question.objective continues to preserve the classifier's
-- finer per-question subtopic. Repair the 28 Sep 2026 AI booklet that was
-- originally split across 15 topic_key values.
update public.question_bank q
set topic_key = 'sayılar ve nicelikler 1',
    question = q.question || jsonb_build_object(
      'bookletTopic', 'Sayılar ve Nicelikler (1)'
    ),
    updated_at = now()
where q.source_engine = 'ai_booklet_exact'
  and q.grade_key = 'ortaokul 7 sinif'
  and q.subject_key = 'matematik'
  and q.created_at = timestamptz '2026-09-28 09:14:46.511918+00'
  and q.question->>'sourcePolicy' = 'ai_exact';
