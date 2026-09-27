-- Transfer Check v1: schedule delayed, different-context checks without
-- changing the existing mastery score until the transfer result is evaluated.
CREATE TABLE IF NOT EXISTS public.learning_transfer_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  source_question_index integer NOT NULL CHECK (source_question_index >= 0),
  subject text NOT NULL DEFAULT 'Genel',
  grade text,
  topic text NOT NULL,
  learning_objective_id text,
  learning_objective_code text,
  due_after_event_count integer NOT NULL CHECK (due_after_event_count >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','served','completed','expired')),
  transfer_result text CHECK (transfer_result IS NULL OR transfer_result IN ('independent_success','assisted_success','not_transferred','unanswered')),
  prompt_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  served_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_transfer_checks_source_unique UNIQUE (student_id, source_session_id, source_question_index)
);

CREATE INDEX IF NOT EXISTS learning_transfer_checks_due_idx
  ON public.learning_transfer_checks (student_id, status, due_after_event_count, created_at);
CREATE INDEX IF NOT EXISTS learning_transfer_checks_objective_idx
  ON public.learning_transfer_checks (student_id, learning_objective_id, status);

ALTER TABLE public.learning_transfer_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS learning_transfer_checks_student_select ON public.learning_transfer_checks;
CREATE POLICY learning_transfer_checks_student_select ON public.learning_transfer_checks
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = student_id);
REVOKE INSERT, UPDATE, DELETE ON public.learning_transfer_checks FROM anon, authenticated;
GRANT SELECT ON public.learning_transfer_checks TO authenticated;
GRANT ALL ON public.learning_transfer_checks TO service_role;

CREATE OR REPLACE FUNCTION public.schedule_transfer_checks_v1(
  p_student_id uuid,
  p_session_id uuid,
  p_min_delay integer DEFAULT 10,
  p_max_checks integer DEFAULT 5
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.quiz_sessions%ROWTYPE;
  v_event_count integer;
  v_inserted integer := 0;
  v_question jsonb;
  v_index integer := 0;
  v_objective_id text;
  v_objective_code text;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_student_id THEN
    RAISE EXCEPTION 'student mismatch';
  END IF;
  SELECT * INTO v_session FROM public.quiz_sessions
   WHERE id = p_session_id AND user_id = p_student_id AND completed = true;
  IF NOT FOUND THEN RETURN 0; END IF;
  SELECT count(*)::integer INTO v_event_count FROM public.learning_events WHERE student_id = p_student_id;

  FOR v_question IN SELECT value FROM jsonb_array_elements(coalesce(v_session.questions, '[]'::jsonb))
  LOOP
    v_objective_id := nullif(v_question->>'learningObjectiveId', '');
    v_objective_code := nullif(v_question->>'learningObjectiveCode', '');
    IF v_objective_id IS NOT NULL AND v_question->>'objectiveMappingStatus' = 'mapped' THEN
      INSERT INTO public.learning_transfer_checks (
        student_id, source_session_id, source_question_index, subject, grade, topic,
        learning_objective_id, learning_objective_code, due_after_event_count, prompt_context
      ) VALUES (
        p_student_id, p_session_id, v_index,
        coalesce(nullif(v_question->>'subject',''), 'Genel'), v_session.grade, v_session.topic,
        v_objective_id, v_objective_code, v_event_count + greatest(10, p_min_delay),
        jsonb_build_object('sourceQuestionType', v_question->>'type', 'sourceDifficulty', v_question->>'difficulty', 'sourceQuestion', left(coalesce(v_question->>'q',''), 500))
      ) ON CONFLICT (student_id, source_session_id, source_question_index) DO NOTHING;
      v_inserted := v_inserted + 1;
      IF v_inserted >= greatest(1, p_max_checks) THEN EXIT; END IF;
    END IF;
    v_index := v_index + 1;
  END LOOP;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_transfer_checks_v1(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_transfer_checks_v1(uuid, uuid, integer, integer) TO service_role;
COMMENT ON TABLE public.learning_transfer_checks IS
  'Delayed cross-context checks scheduled from mapped quiz questions; excluded from ordinary mastery until explicitly evaluated.';
