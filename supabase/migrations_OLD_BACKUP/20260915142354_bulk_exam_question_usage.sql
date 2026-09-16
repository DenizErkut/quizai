DROP FUNCTION IF EXISTS public.increment_exam_question_use(uuid);

CREATE OR REPLACE FUNCTION public.mark_exam_questions_used(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.exam_question_bank
  SET use_count = use_count + 1,
      last_used_at = now()
  WHERE id = ANY(p_ids);
$$;

REVOKE ALL ON FUNCTION public.mark_exam_questions_used(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_exam_questions_used(uuid[]) TO service_role;
