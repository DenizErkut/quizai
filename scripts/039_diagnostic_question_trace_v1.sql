-- Diagnostic question strategy v1 trace.
-- Adds server-authored diagnostic metadata to immutable Learning Events.

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
        'adaptiveRecommendationId', q->>'adaptiveRecommendationId',
        'diagnosticStrategyVersion', q->>'diagnosticStrategyVersion',
        'diagnosticReasonCode', q->>'diagnosticReasonCode',
        'diagnosticRole', q->>'diagnosticRole',
        'masteryConfidenceBefore', q->>'masteryConfidenceBefore',
        'masteryEvidenceCountBefore', q->>'masteryEvidenceCountBefore'
      ));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_adaptive_trace_to_learning_event()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_adaptive_trace_to_learning_event()
  TO service_role;

COMMENT ON FUNCTION public.attach_adaptive_trace_to_learning_event() IS
  'Copies server-authored adaptive and low-confidence diagnostic decision metadata from quiz questions into immutable learning events.';

