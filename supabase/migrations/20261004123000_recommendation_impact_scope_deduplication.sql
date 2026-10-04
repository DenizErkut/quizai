CREATE OR REPLACE FUNCTION public.measure_recommendation_impact_from_events_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  WITH exposures AS (
    SELECT (e.metadata->>'adaptiveRecommendationId')::uuid AS recommendation_id,
      e.student_id, e.source_id AS quiz_session_id, min(e.occurred_at) AS applied_at,
      count(*)::integer AS event_count,
      round((100 * sum(e.score) / nullif(sum(e.max_score), 0))::numeric, 2) AS event_score_pct
    FROM inserted_learning_events e
    WHERE e.source_type='quiz_session' AND e.source_id IS NOT NULL
      AND coalesce(e.metadata->>'adaptiveRecommendationId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    GROUP BY (e.metadata->>'adaptiveRecommendationId')::uuid,e.student_id,e.source_id
  ), resolved_raw AS (
    SELECT x.*,r.subject,r.topic,r.action_type,r.engine_version,r.evidence,
      edge.id AS graph_edge_id,edge.relation_version AS graph_relation_version,
      sm.mastery_score AS post_mastery,
      CASE WHEN r.action_type='prerequisite_remediation' THEN nullif(r.evidence->>'prerequisiteMastery','')::numeric
        ELSE nullif(r.evidence->>'masteryScore','')::numeric END AS baseline_mastery,
      nullif(r.evidence->>'retentionScore','')::numeric AS baseline_retention
    FROM exposures x JOIN public.student_recommendations r ON r.id=x.recommendation_id AND r.student_id=x.student_id
    LEFT JOIN public.learning_graph_nodes target_node ON target_node.node_type='topic' AND target_node.is_active
      AND lower(target_node.label)=lower(r.evidence->>'targetTopic')
      AND lower(coalesce(target_node.subject,r.subject))=lower(r.subject)
    LEFT JOIN public.learning_graph_nodes source_node ON source_node.node_type='topic' AND source_node.is_active
      AND lower(source_node.label)=lower(r.topic) AND lower(coalesce(source_node.subject,r.subject))=lower(r.subject)
    LEFT JOIN public.learning_graph_edges edge ON edge.source_node_id=source_node.id AND edge.target_node_id=target_node.id
      AND edge.edge_type='prerequisite_of' AND edge.is_verified
    LEFT JOIN public.student_mastery sm ON sm.student_id=r.student_id AND sm.learning_objective_key=''
      AND lower(sm.subject)=lower(r.subject) AND lower(sm.topic)=lower(r.topic)
  )
  , counted AS (
    SELECT *, count(*) OVER (PARTITION BY recommendation_id,quiz_session_id) AS match_count FROM resolved_raw
  ), resolved AS (
    SELECT DISTINCT ON (recommendation_id,quiz_session_id) * FROM counted
    ORDER BY recommendation_id,quiz_session_id
  )
  INSERT INTO public.recommendation_impact_measurements
    (recommendation_id,student_id,quiz_session_id,subject,topic,action_type,engine_version,
     graph_used,graph_edge_id,graph_relation_version,baseline_mastery,baseline_retention,
     post_mastery,mastery_delta,event_score_pct,event_count,applied_at,evaluated_at,metadata,updated_at)
  SELECT recommendation_id,student_id,quiz_session_id,subject,topic,action_type,engine_version,
    match_count = 1 AND graph_edge_id IS NOT NULL,
    CASE WHEN match_count = 1 THEN graph_edge_id END,
    CASE WHEN match_count = 1 THEN graph_relation_version END,baseline_mastery,baseline_retention,
    CASE WHEN match_count = 1 THEN post_mastery END,CASE WHEN match_count = 1 AND baseline_mastery IS NOT NULL AND post_mastery IS NOT NULL THEN round(post_mastery-baseline_mastery,2) END,
    event_score_pct,event_count,applied_at,CASE WHEN event_count>0 THEN now() END,
    jsonb_build_object('reasonCode',evidence->>'reasonCode','targetTopic',evidence->>'targetTopic','ambiguous_scope',match_count > 1,'scope_match_count',match_count),now()
  FROM resolved
  ON CONFLICT (recommendation_id,quiz_session_id) DO UPDATE SET
    post_mastery=EXCLUDED.post_mastery,mastery_delta=EXCLUDED.mastery_delta,
    event_score_pct=EXCLUDED.event_score_pct,event_count=EXCLUDED.event_count,
    evaluated_at=EXCLUDED.evaluated_at,graph_used=EXCLUDED.graph_used,
    graph_edge_id=EXCLUDED.graph_edge_id,graph_relation_version=EXCLUDED.graph_relation_version,
    metadata=EXCLUDED.metadata,updated_at=now();

  UPDATE public.student_recommendations r SET
    first_applied_at=stats.first_applied_at,last_applied_at=stats.last_applied_at,
    last_applied_session_id=stats.last_session_id,application_count=stats.application_count
  FROM (
    SELECT m.recommendation_id,min(m.applied_at) AS first_applied_at,max(m.applied_at) AS last_applied_at,
      (array_agg(m.quiz_session_id ORDER BY m.applied_at DESC))[1] AS last_session_id,count(*)::integer AS application_count
    FROM public.recommendation_impact_measurements m
    WHERE m.recommendation_id IN (
      SELECT DISTINCT (e.metadata->>'adaptiveRecommendationId')::uuid FROM inserted_learning_events e
      WHERE coalesce(e.metadata->>'adaptiveRecommendationId','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    GROUP BY m.recommendation_id
  ) stats WHERE r.id=stats.recommendation_id;
  RETURN NULL;
END; $function$
;
REVOKE ALL ON FUNCTION public.measure_recommendation_impact_from_events_v1() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.measure_recommendation_impact_from_events_v1() TO service_role;
