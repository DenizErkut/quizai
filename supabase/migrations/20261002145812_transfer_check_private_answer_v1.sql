-- The served transfer item contains its answer key in prompt_context. Only
-- server routes may read this table; the student-facing API returns a safe
-- projection without the key. No client code reads the table directly.
DROP POLICY IF EXISTS learning_transfer_checks_student_select ON public.learning_transfer_checks;
REVOKE ALL ON public.learning_transfer_checks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_transfer_checks TO service_role;
