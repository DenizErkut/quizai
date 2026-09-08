-- Learning Graph -> Recommendation Impact Measurement v1
-- Measures recommendation exposure and immediate post-quiz outcome without
-- changing recommendation ranking or adaptive behavior.

ALTER TABLE public.student_recommendations
  ADD COLUMN IF NOT EXISTS first_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_applied_session_id uuid REFERENCES public.quiz_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS application_count integer NOT NULL DEFAULT 0 CHECK (application_count >= 0);

CREATE TABLE IF NOT EXISTS public.recommendation_impact_measurements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES public.student_recommendations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quiz_session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  subject text NOT NULL,
  topic text NOT NULL,
  action_type text NOT NULL,
  engine_version text NOT NULL,
  graph_used boolean NOT NULL DEFAULT false,
  graph_edge_id uuid,
  graph_relation_version integer,
  baseline_mastery numeric(5,2),
  baseline_retention numeric(5,2),
  post_mastery numeric(5,2),
  mastery_delta numeric(6,2),
  event_score_pct numeric(5,2),
  event_count integer NOT NULL DEFAULT 0 CHECK (event_count >= 0),
  applied_at timestamptz NOT NULL,
  evaluated_at timestamptz,
  measurement_version text NOT NULL DEFAULT 'graph-impact-v1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_impact_session_unique UNIQUE (recommendation_id, quiz_session_id)
);

CREATE INDEX IF NOT EXISTS recommendation_impact_graph_time_idx
  ON public.recommendation_impact_measurements (graph_used, applied_at DESC);
CREATE INDEX IF NOT EXISTS recommendation_impact_subject_action_idx
  ON public.recommendation_impact_measurements (subject, action_type, applied_at DESC);
CREATE INDEX IF NOT EXISTS recommendation_impact_student_time_idx
  ON public.recommendation_impact_measurements (student_id, applied_at DESC);

ALTER TABLE public.recommendation_impact_measurements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recommendation_impact_measurements FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.recommendation_impact_measurements TO service_role;

CREATE OR REPLACE FUNCTION public.measure_recommendation_impact_from_events_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
BEGIN
  WITH exposures AS (
    SELECT
      (e.metadata->>'adaptiveRecommendationId')::uuid AS recommendation_id,
      e.student_id,
      e.source_id AS quiz_session_id,
      min(e.occurred_at) AS applied_at,
      count(*)::integer AS event_count,
      round((100 * sum(e.score) / nullif(sum(e.max_score), 0))::numeric, 2) AS event_score_pct
    FROM inserted_learning_events e
    WHERE e.source_type = 'quiz_session' AND e.source_id IS NOT NULL
      AND coalesce(e.metadata->>'adaptiveRecommendationId', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    GROUP BY (e.metadata->>'adaptiveRecommendationId')::uuid, e.student_id, e.source_id
  ), resolved AS (
    SELECT x.*, r.subject, r.topic, r.action_type, r.engine_version, r.evidence,
      edge.id AS graph_edge_id, edge.relation_version AS graph_relation_version,
      sm.mastery_score AS post_mastery,
      CASE WHEN r.action_type = 'prerequisite_remediation'
        THEN nullif(r.evidence->>'prerequisiteMastery', '')::numeric
        ELSE nullif(r.evidence->>'masteryScore', '')::numeric END AS baseline_mastery,
      nullif(r.evidence->>'retentionScore', '')::numeric AS baseline_retention
    FROM exposures x
    JOIN public.student_recommendations r
      ON r.id = x.recommendation_id AND r.student_id = x.student_id
    LEFT JOIN public.learning_graph_nodes target_node
      ON target_node.node_type = 'topic' AND target_node.is_active
     AND lower(target_node.label) = lower(r.evidence->>'targetTopic')
     AND lower(coalesce(target_node.subject, r.subject)) = lower(r.subject)
    LEFT JOIN public.learning_graph_nodes source_node
      ON source_node.node_type = 'topic' AND source_node.is_active
     AND lower(source_node.label) = lower(r.topic)
     AND lower(coalesce(source_node.subject, r.subject)) = lower(r.subject)
    LEFT JOIN public.learning_graph_edges edge
      ON edge.source_node_id = source_node.id AND edge.target_node_id = target_node.id
     AND edge.edge_type = 'prerequisite_of' AND edge.is_verified
    LEFT JOIN public.student_mastery sm
      ON sm.student_id = r.student_id AND sm.learning_objective_key = ''
     AND lower(sm.subject) = lower(r.subject) AND lower(sm.topic) = lower(r.topic)
  )
  INSERT INTO public.recommendation_impact_measurements
    (recommendation_id, student_id, quiz_session_id, subject, topic, action_type,
     engine_version, graph_used, graph_edge_id, graph_relation_version,
     baseline_mastery, baseline_retention, post_mastery, mastery_delta,
     event_score_pct, event_count, applied_at, evaluated_at, metadata, updated_at)
  SELECT recommendation_id, student_id, quiz_session_id, subject, topic, action_type,
    engine_version, graph_edge_id IS NOT NULL, graph_edge_id, graph_relation_version,
    baseline_mastery, baseline_retention, post_mastery,
    CASE WHEN baseline_mastery IS NOT NULL AND post_mastery IS NOT NULL
      THEN round(post_mastery - baseline_mastery, 2) END,
    event_score_pct, event_count, applied_at,
    CASE WHEN event_count > 0 THEN now() END,
    jsonb_build_object('reasonCode', evidence->>'reasonCode',
      'targetTopic', evidence->>'targetTopic'), now()
  FROM resolved
  ON CONFLICT (recommendation_id, quiz_session_id) DO UPDATE SET
    post_mastery = EXCLUDED.post_mastery,
    mastery_delta = EXCLUDED.mastery_delta,
    event_score_pct = EXCLUDED.event_score_pct,
    event_count = EXCLUDED.event_count,
    evaluated_at = EXCLUDED.evaluated_at,
    graph_used = EXCLUDED.graph_used,
    graph_edge_id = EXCLUDED.graph_edge_id,
    graph_relation_version = EXCLUDED.graph_relation_version,
    updated_at = now();

  UPDATE public.student_recommendations r SET
    first_applied_at = stats.first_applied_at,
    last_applied_at = stats.last_applied_at,
    last_applied_session_id = stats.last_session_id,
    application_count = stats.application_count
  FROM (
    SELECT m.recommendation_id, min(m.applied_at) AS first_applied_at,
      max(m.applied_at) AS last_applied_at,
      (array_agg(m.quiz_session_id ORDER BY m.applied_at DESC))[1] AS last_session_id,
      count(*)::integer AS application_count
    FROM public.recommendation_impact_measurements m
    WHERE m.recommendation_id IN (
      SELECT DISTINCT (e.metadata->>'adaptiveRecommendationId')::uuid
      FROM inserted_learning_events e
      WHERE coalesce(e.metadata->>'adaptiveRecommendationId', '')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    GROUP BY m.recommendation_id
  ) stats
  WHERE r.id = stats.recommendation_id;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS zz_learning_events_measure_recommendation_impact_v1 ON public.learning_events;
CREATE TRIGGER zz_learning_events_measure_recommendation_impact_v1
AFTER INSERT ON public.learning_events
REFERENCING NEW TABLE AS inserted_learning_events
FOR EACH STATEMENT EXECUTE FUNCTION public.measure_recommendation_impact_from_events_v1();

REVOKE ALL ON FUNCTION public.measure_recommendation_impact_from_events_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measure_recommendation_impact_from_events_v1() TO service_role;

CREATE OR REPLACE VIEW public.learning_graph_recommendation_impact_summary
WITH (security_invoker = true) AS
SELECT subject, action_type, graph_used, engine_version, measurement_version,
  count(*)::bigint AS sample_size,
  count(*) FILTER (WHERE evaluated_at IS NOT NULL)::bigint AS evaluated_count,
  round(avg(event_score_pct), 2) AS avg_event_score_pct,
  round(avg(mastery_delta), 2) AS avg_mastery_delta,
  round(avg(baseline_mastery), 2) AS avg_baseline_mastery,
  min(applied_at) AS first_applied_at,
  max(applied_at) AS last_applied_at
FROM public.recommendation_impact_measurements
GROUP BY subject, action_type, graph_used, engine_version, measurement_version;

REVOKE ALL ON public.learning_graph_recommendation_impact_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learning_graph_recommendation_impact_summary TO service_role;

COMMENT ON TABLE public.recommendation_impact_measurements IS
  'Session-level recommendation exposure and outcome measurements; graph_used enables stratified comparison, not causal claims.';
