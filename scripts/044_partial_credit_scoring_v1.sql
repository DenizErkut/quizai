-- Partial Credit Scoring v1
-- Keeps legacy binary answers valid while allowing 0..1 awardedScore evidence.

-- Binary summary columns stay intact because leaderboard and legacy reports depend on them.
ALTER TABLE public.quiz_sessions ADD COLUMN IF NOT EXISTS partial_score numeric(8,3);
ALTER TABLE public.quiz_sessions ADD COLUMN IF NOT EXISTS partial_pct numeric(5,2)
  CHECK (partial_pct BETWEEN 0 AND 100);
ALTER TABLE public.assignment_completions ADD COLUMN IF NOT EXISTS partial_score numeric(8,3);
ALTER TABLE public.assignment_completions ADD COLUMN IF NOT EXISTS partial_pct numeric(5,2)
  CHECK (partial_pct BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION public.apply_quiz_partial_credit_to_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_answer jsonb;
  v_awarded numeric;
BEGIN
  IF NEW.source_type <> 'quiz_session' THEN RETURN NEW; END IF;

  SELECT answer INTO v_answer
  FROM public.quiz_sessions qs
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(qs.answers::jsonb, '[]'::jsonb))
    WITH ORDINALITY AS a(answer, ordinality)
  WHERE qs.id = NEW.source_id AND a.ordinality = NEW.question_index + 1;

  IF v_answer ? 'awardedScore' THEN
    v_awarded := greatest(0, least(1, coalesce((v_answer->>'awardedScore')::numeric, 0)));
    NEW.score := v_awarded;
    NEW.max_score := 1;
    NEW.result := CASE WHEN v_awarded = 1 THEN 'correct' ELSE 'incorrect' END;
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) ||
      jsonb_build_object('schema_version', 2, 'scoring_model', 'partial_credit_v1');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_events_partial_credit_before_insert ON public.learning_events;
CREATE TRIGGER learning_events_partial_credit_before_insert
BEFORE INSERT ON public.learning_events
FOR EACH ROW EXECUTE FUNCTION public.apply_quiz_partial_credit_to_event();

REVOKE ALL ON FUNCTION public.apply_quiz_partial_credit_to_event() FROM PUBLIC, anon, authenticated;
