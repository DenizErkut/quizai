-- Recommendation Engine v1: explainable next-best learning actions.

CREATE TABLE IF NOT EXISTS public.student_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  topic text NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'prerequisite_remediation', 'misconception_review',
    'mastery_practice', 'spaced_review'
  )),
  priority_score numeric(6,2) NOT NULL CHECK (priority_score BETWEEN 0 AND 100),
  reason_code text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'dismissed', 'superseded')),
  engine_version text NOT NULL DEFAULT 'v1',
  generated_at timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

CREATE INDEX IF NOT EXISTS student_recommendations_active_idx
  ON public.student_recommendations (student_id, status, priority_score DESC);

ALTER TABLE public.student_recommendations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_recommendations_select_own ON public.student_recommendations;
CREATE POLICY student_recommendations_select_own
  ON public.student_recommendations FOR SELECT TO authenticated
  USING ((select auth.uid()) = student_id);

REVOKE INSERT, UPDATE, DELETE ON public.student_recommendations FROM anon, authenticated;
GRANT SELECT ON public.student_recommendations TO authenticated;
GRANT ALL ON public.student_recommendations TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_student_recommendations(p_student_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE v_inserted integer := 0;
BEGIN
  UPDATE public.student_recommendations
  SET status = 'superseded'
  WHERE student_id = p_student_id AND status = 'active';

  WITH mastery_candidates AS (
    SELECT
      sm.student_id, sm.subject, sm.topic,
      CASE WHEN sm.retention_score < 60 THEN 'spaced_review' ELSE 'mastery_practice' END AS action_type,
      least(100, greatest(0,
        (100 - sm.mastery_score) * 0.60 +
        (100 - sm.retention_score) * 0.25 +
        CASE WHEN sm.trend = 'declining' THEN 10 ELSE 0 END
      )) AS priority_score,
      CASE WHEN sm.retention_score < 60 THEN 'RETENTION_RISK'
           WHEN sm.trend = 'declining' THEN 'DECLINING_MASTERY'
           ELSE 'LOW_MASTERY' END AS reason_code,
      CASE WHEN sm.retention_score < 60
           THEN format('%s konusu tekrar zamanı geldi (kalıcılık: %s/100)', sm.topic, round(sm.retention_score))
           ELSE format('%s konusunda temel pekiştirme gerekli (mastery: %s/100)', sm.topic, round(sm.mastery_score)) END AS reason,
      jsonb_build_object(
        'masteryScore', sm.mastery_score, 'confidenceScore', sm.confidence_score,
        'retentionScore', sm.retention_score, 'trend', sm.trend,
        'attemptCount', sm.attempt_count
      ) AS evidence
    FROM public.student_mastery sm
    WHERE sm.student_id = p_student_id AND sm.learning_objective_key = ''
      AND (sm.mastery_score < 75 OR sm.retention_score < 60)
  ), misconception_candidates AS (
    SELECT
      s.student_id, s.subject, s.topic, 'misconception_review'::text AS action_type,
      least(100, 85 + s.confidence_score * 15) AS priority_score,
      'CONFIRMED_MISCONCEPTION'::text AS reason_code,
      format('%s konusunda tekrar eden bir kavram yanılgısını gözden geçir', s.topic) AS reason,
      jsonb_build_object(
        'misconceptionId', s.misconception_id, 'label', c.label,
        'evidenceCount', s.evidence_count, 'confidenceScore', s.confidence_score
      ) AS evidence
    FROM public.student_misconceptions s
    JOIN public.misconception_catalog c ON c.id = s.misconception_id
    WHERE s.student_id = p_student_id AND s.status = 'confirmed'
      AND c.verification_status <> 'rejected'
  ), prerequisite_candidates AS (
    SELECT
      sm.student_id, coalesce(source_node.subject, sm.subject), source_node.label AS topic,
      'prerequisite_remediation'::text AS action_type,
      least(100, 90 + (60 - coalesce(pm.mastery_score, 0)) * 0.15) AS priority_score,
      'PREREQUISITE_GAP'::text AS reason_code,
      format('%s öncesinde %s temelini güçlendir', sm.topic, source_node.label) AS reason,
      jsonb_build_object(
        'targetTopic', sm.topic, 'prerequisiteMastery', pm.mastery_score,
        'edgeConfidence', edge.confidence
      ) AS evidence
    FROM public.student_mastery sm
    JOIN public.learning_graph_nodes target_node
      ON target_node.node_type = 'topic' AND target_node.is_active
      AND lower(target_node.label) = lower(sm.topic)
      AND lower(coalesce(target_node.subject, sm.subject)) = lower(sm.subject)
    JOIN public.learning_graph_edges edge
      ON edge.target_node_id = target_node.id
      AND edge.edge_type = 'prerequisite_of' AND edge.is_verified
    JOIN public.learning_graph_nodes source_node
      ON source_node.id = edge.source_node_id AND source_node.is_active
    LEFT JOIN public.student_mastery pm
      ON pm.student_id = sm.student_id AND pm.learning_objective_key = ''
      AND lower(pm.topic) = lower(source_node.label)
      AND lower(pm.subject) = lower(coalesce(source_node.subject, sm.subject))
    WHERE sm.student_id = p_student_id AND sm.learning_objective_key = ''
      AND sm.mastery_score < 70 AND coalesce(pm.mastery_score, 0) < 60
  ), ranked AS (
    SELECT *, row_number() OVER (
      PARTITION BY student_id, lower(topic), action_type ORDER BY priority_score DESC
    ) AS duplicate_rank
    FROM (
      SELECT * FROM mastery_candidates
      UNION ALL SELECT * FROM misconception_candidates
      UNION ALL SELECT * FROM prerequisite_candidates
    ) candidates
  )
  INSERT INTO public.student_recommendations (
    student_id, subject, topic, action_type, priority_score,
    reason_code, reason, evidence
  )
  SELECT student_id, subject, topic, action_type, round(priority_score, 2),
         reason_code, reason, evidence
  FROM ranked
  WHERE duplicate_rank = 1
  ORDER BY priority_score DESC
  LIMIT 10;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_student_recommendations(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_student_recommendations(uuid) TO service_role;

DO $$ DECLARE sid uuid;
BEGIN
  FOR sid IN SELECT DISTINCT student_id FROM public.student_mastery LOOP
    PERFORM public.refresh_student_recommendations(sid);
  END LOOP;
END $$;

COMMENT ON TABLE public.student_recommendations IS
  'Auditable next-best learning actions derived from mastery, retention, graph prerequisites and confirmed misconceptions.';
