-- Exact booklet imports used bare numeric grade values, while live quiz
-- dimensions use canonical school-level keys. Align existing rows so the
-- admin facets and runtime bank lookup see the same grade.
update public.question_bank
set grade_key = case grade_key
  when '1' then 'ilkokul 1 sinif'
  when '2' then 'ilkokul 2 sinif'
  when '3' then 'ilkokul 3 sinif'
  when '4' then 'ilkokul 4 sinif'
  when '5' then 'ortaokul 5 sinif'
  when '6' then 'ortaokul 6 sinif'
  when '7' then 'ortaokul 7 sinif'
  when '8' then 'ortaokul 8 sinif'
  when '9' then 'lise 9 sinif'
  when '10' then 'lise 10 sinif'
  when '11' then 'lise 11 sinif'
  when '12' then 'lise 12 sinif'
  else grade_key
end,
updated_at = now()
where source_engine in ('teacher_booklet_exact', 'ai_booklet_exact')
  and grade_key ~ '^[0-9]{1,2}$';

-- The 27 September rational-numbers booklet was AI-prepared but was loaded
-- before the AI source option existed, so it inherited the teacher marker.
update public.question_bank
set source_engine = 'ai_booklet_exact',
    question = jsonb_set(question, '{sourcePolicy}', '"ai_exact"'::jsonb, true),
    updated_at = now()
where source_engine = 'teacher_booklet_exact'
  and subject_key = 'matematik'
  and created_at >= timestamptz '2026-09-27 21:20:00+00';
