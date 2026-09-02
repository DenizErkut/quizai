-- Adaptive Learning v2 audit trace for immutable Learning Events.

CREATE OR REPLACE FUNCTION public.attach_adaptive_trace_to_learning_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE q jsonb;
BEGIN
  IF NEW.source_type = 'quiz_session' AND NEW.source_id IS NOT NULL THEN
    SELECT questions::jsonb -> NEW.question_index INTO q
    FROM public.quiz_sessions
    WHERE id = NEW.source_id;

    IF q IS NOT NULL THEN
      NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'adaptivePolicyVersion', q->>'adaptivePolicyVersion',
        'adaptiveFocus', q->>'adaptiveFocus',
        'adaptiveReasonCode', q->>'adaptiveReasonCode',
        'adaptiveRecommendationId', q->>'adaptiveRecommendationId'
      ));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_adaptive_trace_to_learning_event()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS learning_events_attach_adaptive_trace
  ON public.learning_events;
CREATE TRIGGER learning_events_attach_adaptive_trace
BEFORE INSERT ON public.learning_events
FOR EACH ROW EXECUTE FUNCTION public.attach_adaptive_trace_to_learning_event();

COMMENT ON FUNCTION public.attach_adaptive_trace_to_learning_event() IS
  'Copies server-authored adaptive decision metadata from quiz questions into immutable learning events.';
