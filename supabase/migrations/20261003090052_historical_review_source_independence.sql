ALTER TABLE public.historical_objective_backfill_reviews ADD COLUMN review_history jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.apply_historical_objective_backfill_review(uuid,text,uuid,integer,jsonb,uuid,jsonb,text,text,text,text,jsonb)'::regprocedure);
BEGIN
  IF position($old$AND NOT coalesce((v_question->>'sourceBased')::boolean, false) AND coalesce(v_question->>'passage', '')=''$old$ IN definition)=0 THEN RAISE EXCEPTION 'Unexpected backfill function'; END IF;
  definition := replace(definition, $old$AND NOT coalesce((v_question->>'sourceBased')::boolean, false) AND coalesce(v_question->>'passage', '')=''$old$,
    $new$AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_review->'audits') a WHERE a->'standalone' IS DISTINCT FROM 'true'::jsonb)$new$);
  definition := replace(definition, $old$WHERE run_id=p_run_id AND source=p_source AND record_id=p_record_id AND question_index=p_question_index) THEN$old$,
    $new$WHERE run_id=p_run_id AND source=p_source AND record_id=p_record_id AND question_index=p_question_index AND coalesce(review->>'superseded','false')<>'true') THEN$new$);
  definition := replace(definition, $old$VALUES (p_run_id,p_source,p_record_id,p_question_index,v_question,v_bank_state,v_old_events,v_updated,v_review);$old$,
    $new$VALUES (p_run_id,p_source,p_record_id,p_question_index,v_question,v_bank_state,v_old_events,v_updated,v_review)
    ON CONFLICT (run_id,source,record_id,question_index) DO UPDATE SET applied_question=excluded.applied_question, review=excluded.review,
      review_history=historical_objective_backfill_reviews.review_history || jsonb_build_array(historical_objective_backfill_reviews.review);$new$);
  EXECUTE definition;
END;
$migration$;
