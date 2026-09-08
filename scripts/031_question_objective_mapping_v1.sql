-- Question -> Canonical Learning Objective Mapping Pipeline v1.

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS objective_mapping_version text,
  ADD COLUMN IF NOT EXISTS objective_candidate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS objective_mapped_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.quiz_sessions
  DROP CONSTRAINT IF EXISTS quiz_sessions_objective_mapping_counts_check;
ALTER TABLE public.quiz_sessions
  ADD CONSTRAINT quiz_sessions_objective_mapping_counts_check CHECK (
    objective_candidate_count >= 0 AND objective_mapped_count >= 0
    AND objective_mapped_count <= question_count
  );

-- Final database guard: only an active, verified catalog UUID may enter the
-- immutable Learning Event stream. Invalid/model-invented values become NULL;
-- the quiz completion itself is never blocked.
CREATE OR REPLACE FUNCTION public.validate_learning_event_objective_v1()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.learning_objective_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.learning_objective_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR NOT EXISTS (
       SELECT 1 FROM public.learning_objective_catalog c
       WHERE c.id::text = NEW.learning_objective_id
         AND c.verification_status = 'verified' AND c.is_active = true
     ) THEN
    NEW.learning_objective_id := NULL;
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('objective_mapping_status', 'rejected_by_catalog_guard');
  ELSE
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('objective_mapping_status', 'verified',
                            'objective_mapping_version', 'v1');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_events_validate_objective_v1 ON public.learning_events;
CREATE TRIGGER learning_events_validate_objective_v1
BEFORE INSERT OR UPDATE OF learning_objective_id ON public.learning_events
FOR EACH ROW EXECUTE FUNCTION public.validate_learning_event_objective_v1();

REVOKE ALL ON FUNCTION public.validate_learning_event_objective_v1()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_learning_event_objective_v1() TO service_role;

CREATE INDEX IF NOT EXISTS quiz_sessions_objective_mapping_idx
  ON public.quiz_sessions (objective_mapping_version, created_at DESC)
  WHERE objective_mapping_version IS NOT NULL;

