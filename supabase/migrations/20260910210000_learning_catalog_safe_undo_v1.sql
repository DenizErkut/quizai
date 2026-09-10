CREATE OR REPLACE FUNCTION public.undo_learning_catalog_review_v1(p_audit_id uuid,p_reviewer_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE a public.learning_catalog_review_audit%ROWTYPE;q public.learning_catalog_review_queue%ROWTYPE;used_count integer;other_mappings integer;node_id uuid;
BEGIN
  SELECT * INTO a FROM public.learning_catalog_review_audit WHERE id=p_audit_id FOR SHARE;
  IF NOT FOUND OR a.action NOT IN ('map','dismiss') THEN RAISE EXCEPTION 'Undoable review decision not found'; END IF;
  IF EXISTS(SELECT 1 FROM public.learning_catalog_review_audit newer WHERE newer.dimension_key=a.dimension_key AND newer.created_at>a.created_at) THEN RAISE EXCEPTION 'Only the latest decision can be undone'; END IF;
  SELECT * INTO q FROM public.learning_catalog_review_queue WHERE dimension_key=a.dimension_key FOR UPDATE;
  IF NOT FOUND OR q.status IS DISTINCT FROM (a.after_state->>'status') THEN RAISE EXCEPTION 'Candidate state changed after this decision'; END IF;
  IF a.action='map' THEN
    node_id:=NULLIF(a.after_state->>'mapped_node_id','')::uuid;
    SELECT count(*) INTO used_count FROM public.learning_events WHERE metadata->>'catalog_mapping_key'=a.dimension_key;
    IF used_count>0 THEN RAISE EXCEPTION 'Mapping already normalized % learning events; create a forward correction instead',used_count; END IF;
    DELETE FROM public.learning_content_node_mappings WHERE source_type='quiz_topic' AND source_id=a.dimension_key AND node_id=node_id;
    DELETE FROM public.learning_topic_aliases WHERE alias_key=public.learning_dimension_key(q.observed_label) AND notes='Admin catalog review: '||a.dimension_key;
    SELECT count(*) INTO other_mappings FROM public.learning_content_node_mappings WHERE node_id=node_id;
    IF other_mappings=0 THEN
      DELETE FROM public.learning_graph_edges WHERE source_node_id=node_id AND source_type='admin_review';
      UPDATE public.learning_graph_nodes SET is_active=false,updated_at=now() WHERE id=node_id AND source_type='admin_review';
    END IF;
  END IF;
  UPDATE public.learning_catalog_review_queue SET status='pending',mapped_node_id=NULL,reviewed_by=p_reviewer_id,reviewed_at=now(),updated_at=now() WHERE dimension_key=a.dimension_key;
  RETURN a.dimension_key;
END;$$;
REVOKE ALL ON FUNCTION public.undo_learning_catalog_review_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.undo_learning_catalog_review_v1(uuid,uuid) TO service_role;
COMMENT ON FUNCTION public.undo_learning_catalog_review_v1(uuid,uuid) IS 'Safely resets only the latest unused catalog decision; used mappings require forward correction.';
