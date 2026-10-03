-- Resolve missing historical subject only after both auditors select the same
-- grade-appropriate canonical objective. Preserve explicit source dimensions.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.apply_historical_objective_backfill_review(uuid,text,uuid,integer,jsonb,uuid,jsonb,text,text,text,text,jsonb)'::regprocedure);
BEGIN
  IF position($old$  IF v_approved THEN
    SELECT c.*$old$ IN definition)=0 THEN RAISE EXCEPTION 'Unexpected backfill function'; END IF;
  definition := replace(definition, $old$  IF v_approved THEN
    SELECT c.*$old$, $new$  IF v_approved THEN
    IF nullif(btrim(v_subject), '') IS NULL OR lower(btrim(v_subject))='genel' THEN v_subject:=p_bank_subject; END IF;
    SELECT c.*$new$);
  definition := replace(definition, $old$  v_mapping := jsonb_build_object($old$, $new$  IF v_approved THEN v_updated:=v_updated || jsonb_build_object('subject', v_objective.subject); END IF;
  v_mapping := jsonb_build_object($new$);
  definition := replace(definition, $old$  IF v_difficulty_ok THEN v_mapping$old$, $new$  IF v_approved THEN v_mapping:=v_mapping || jsonb_build_object('subject', v_objective.subject); END IF;
  IF v_difficulty_ok THEN v_mapping$new$);
  definition := replace(definition, $old$UPDATE public.question_bank SET question=v_updated, updated_at=now(),$old$,
    $new$UPDATE public.question_bank SET question=v_updated, updated_at=now(), subject_key=CASE WHEN v_approved THEN p_bank_subject ELSE subject_key END,$new$);
  definition := replace(definition, $old$jsonb_build_object('id', id, 'objectiveId', learning_objective_id)$old$,
    $new$jsonb_build_object('id', id, 'objectiveId', learning_objective_id, 'subject', subject)$new$);
  definition := replace(definition, $old$UPDATE public.learning_events SET learning_objective_id=CASE WHEN v_approved THEN v_objective.id ELSE NULL END$old$,
    $new$UPDATE public.learning_events SET subject=CASE WHEN v_approved THEN v_objective.subject ELSE subject END,
      learning_objective_id=CASE WHEN v_approved THEN v_objective.id ELSE NULL END$new$);
  EXECUTE definition;
END;
$migration$;
