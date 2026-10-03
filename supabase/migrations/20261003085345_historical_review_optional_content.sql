-- An empty optional property is not a missing visual or source dependency.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.apply_historical_objective_backfill_review(uuid,text,uuid,integer,jsonb,uuid,jsonb,text,text,text,text,jsonb)'::regprocedure);
BEGIN
  IF position($old$NOT (v_question ? 'passage')$old$ IN definition)=0 THEN RAISE EXCEPTION 'Unexpected backfill function'; END IF;
  definition := replace(definition, $old$NOT (v_question ? 'passage')$old$, $new$coalesce(v_question->>'passage', '')=''$new$);
  definition := replace(definition, $old$NOT (v_question ? 'svg')$old$, $new$coalesce(v_question->>'svg', '')=''$new$);
  definition := replace(definition, $old$NOT (v_question ? 'chartData')$old$, $new$coalesce(v_question->'chartData', 'null'::jsonb)='null'::jsonb$new$);
  EXECUTE definition;
END;
$migration$;
