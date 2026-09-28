ALTER TABLE public.quiz_sessions
  DROP CONSTRAINT IF EXISTS quiz_sessions_objective_candidate_basis_check;

ALTER TABLE public.quiz_sessions
  ADD CONSTRAINT quiz_sessions_objective_candidate_basis_check
  CHECK (
    objective_candidate_basis IS NULL
    OR objective_candidate_basis IN (
      'topic_exact',
      'title_keyword',
      'unit_exact',
      'reviewed_alias'
    )
  );
