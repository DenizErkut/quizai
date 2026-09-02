-- Pratium Learning Graph v1
-- Adds a typed, queryable graph while preserving topic_prerequisites for
-- existing consumers. AI suggestions still require explicit admin approval.

CREATE TABLE IF NOT EXISTS public.learning_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_key text NOT NULL UNIQUE,
  node_type text NOT NULL CHECK (node_type IN (
    'grade', 'subject', 'unit', 'topic', 'learning_objective',
    'subskill', 'concept', 'misconception', 'assessment_item'
  )),
  label text NOT NULL,
  subject text,
  grade text,
  level text,
  source_type text NOT NULL DEFAULT 'manual',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_graph_nodes_lookup_idx
  ON public.learning_graph_nodes (node_type, lower(label), lower(subject));

CREATE TABLE IF NOT EXISTS public.learning_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id uuid NOT NULL REFERENCES public.learning_graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.learning_graph_nodes(id) ON DELETE CASCADE,
  edge_type text NOT NULL CHECK (edge_type IN (
    'prerequisite_of', 'part_of', 'related_to', 'reinforces',
    'commonly_confused_with', 'measured_by', 'remediated_by'
  )),
  confidence numeric(4,3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  rationale text,
  source_type text NOT NULL DEFAULT 'manual',
  is_verified boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_graph_edges_distinct_nodes CHECK (source_node_id <> target_node_id),
  CONSTRAINT learning_graph_edges_unique UNIQUE (source_node_id, target_node_id, edge_type)
);

CREATE INDEX IF NOT EXISTS learning_graph_edges_source_idx
  ON public.learning_graph_edges (source_node_id, edge_type);
CREATE INDEX IF NOT EXISTS learning_graph_edges_target_idx
  ON public.learning_graph_edges (target_node_id, edge_type);

ALTER TABLE public.learning_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_graph_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_graph_nodes_authenticated_read ON public.learning_graph_nodes;
CREATE POLICY learning_graph_nodes_authenticated_read
  ON public.learning_graph_nodes FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS learning_graph_edges_authenticated_read ON public.learning_graph_edges;
CREATE POLICY learning_graph_edges_authenticated_read
  ON public.learning_graph_edges FOR SELECT TO authenticated
  USING (is_verified = true);

-- Seed every active curriculum topic as a node. Relations are deliberately
-- not inferred: only expert-approved drafts or existing legacy data make edges.
INSERT INTO public.learning_graph_nodes
  (node_key, node_type, label, subject, grade, level, source_type, metadata)
SELECT
  'topic:' || md5(lower(concat_ws('|', c.level, c.grade, c.subject, t.topic))),
  'topic', t.topic, c.subject, c.grade, c.level, 'curriculum',
  jsonb_build_object('curriculum_id', c.id)
FROM public.curriculum c
CROSS JOIN LATERAL unnest(c.topics) AS t(topic)
WHERE c.is_active = true AND nullif(btrim(t.topic), '') IS NOT NULL
ON CONFLICT (node_key) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  grade = EXCLUDED.grade,
  level = EXCLUDED.level,
  updated_at = now();

-- Preserve the five existing manually entered prerequisite relationships.
WITH legacy_nodes AS (
  SELECT subject, topic AS label FROM public.topic_prerequisites
  UNION
  SELECT subject, prerequisite_topic AS label FROM public.topic_prerequisites
)
INSERT INTO public.learning_graph_nodes
  (node_key, node_type, label, subject, source_type)
SELECT
  'topic:legacy:' || md5(lower(concat_ws('|', subject, label))),
  'topic', label, subject, 'legacy'
FROM legacy_nodes
WHERE nullif(btrim(label), '') IS NOT NULL
ON CONFLICT (node_key) DO NOTHING;

INSERT INTO public.learning_graph_edges
  (source_node_id, target_node_id, edge_type, source_type, is_verified)
SELECT source_node.id, target_node.id, 'prerequisite_of', 'legacy', true
FROM public.topic_prerequisites p
JOIN public.learning_graph_nodes source_node
  ON source_node.node_key = 'topic:legacy:' || md5(lower(concat_ws('|', p.subject, p.prerequisite_topic)))
JOIN public.learning_graph_nodes target_node
  ON target_node.node_key = 'topic:legacy:' || md5(lower(concat_ws('|', p.subject, p.topic)))
ON CONFLICT (source_node_id, target_node_id, edge_type) DO NOTHING;

-- Approval and graph publication happen in one transaction. SECURITY INVOKER
-- means the caller (the server-side service role) retains responsibility.
CREATE OR REPLACE FUNCTION public.approve_learning_graph_draft(
  p_draft_id uuid,
  p_reviewer_id uuid,
  p_topic text DEFAULT NULL,
  p_prerequisite_topic text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  d public.topic_prerequisites_draft%ROWTYPE;
  final_topic text;
  final_prerequisite text;
  target_id uuid;
  source_id uuid;
  new_edge_id uuid;
  confidence_value numeric(4,3);
BEGIN
  SELECT * INTO d
  FROM public.topic_prerequisites_draft
  WHERE id = p_draft_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Taslak bulunamadı'; END IF;
  IF d.status <> 'pending' THEN RAISE EXCEPTION 'Taslak zaten % durumunda', d.status; END IF;

  final_topic := coalesce(nullif(btrim(p_topic), ''), d.topic);
  final_prerequisite := coalesce(nullif(btrim(p_prerequisite_topic), ''), d.prerequisite_topic);
  IF lower(final_topic) = lower(final_prerequisite) THEN
    RAISE EXCEPTION 'Konu kendi ön koşulu olamaz';
  END IF;

  confidence_value := CASE lower(d.confidence)
    WHEN 'high' THEN 0.900 WHEN 'yüksek' THEN 0.900
    WHEN 'medium' THEN 0.650 WHEN 'orta' THEN 0.650
    WHEN 'low' THEN 0.400 WHEN 'düşük' THEN 0.400
    ELSE NULL END;

  INSERT INTO public.learning_graph_nodes
    (node_key, node_type, label, subject, grade, level, source_type)
  VALUES (
    'topic:' || md5(lower(concat_ws('|', d.level, d.grade::text, d.subject, final_topic))),
    'topic', final_topic, d.subject, d.grade::text, d.level, 'approved_draft'
  )
  ON CONFLICT (node_key) DO UPDATE SET label = EXCLUDED.label, updated_at = now()
  RETURNING id INTO target_id;

  INSERT INTO public.learning_graph_nodes
    (node_key, node_type, label, subject, grade, level, source_type)
  VALUES (
    'topic:' || md5(lower(concat_ws('|', d.level, d.grade::text, d.subject, final_prerequisite))),
    'topic', final_prerequisite, d.subject, d.grade::text, d.level, 'approved_draft'
  )
  ON CONFLICT (node_key) DO UPDATE SET label = EXCLUDED.label, updated_at = now()
  RETURNING id INTO source_id;

  INSERT INTO public.learning_graph_edges
    (source_node_id, target_node_id, edge_type, confidence, rationale,
     source_type, is_verified, reviewed_by)
  VALUES (source_id, target_id, 'prerequisite_of', confidence_value, d.rationale,
          'approved_draft', true, p_reviewer_id)
  ON CONFLICT (source_node_id, target_node_id, edge_type) DO UPDATE SET
    confidence = EXCLUDED.confidence,
    rationale = EXCLUDED.rationale,
    is_verified = true,
    reviewed_by = EXCLUDED.reviewed_by,
    updated_at = now()
  RETURNING id INTO new_edge_id;

  -- Compatibility write for older deployments and admin tools.
  IF NOT EXISTS (
    SELECT 1 FROM public.topic_prerequisites
    WHERE lower(subject) = lower(d.subject)
      AND lower(topic) = lower(final_topic)
      AND lower(prerequisite_topic) = lower(final_prerequisite)
  ) THEN
    INSERT INTO public.topic_prerequisites (subject, topic, prerequisite_topic)
    VALUES (d.subject, final_topic, final_prerequisite);
  END IF;

  UPDATE public.topic_prerequisites_draft SET
    status = 'approved', topic = final_topic,
    prerequisite_topic = final_prerequisite,
    reviewed_by = p_reviewer_id, reviewed_at = now()
  WHERE id = p_draft_id;

  RETURN new_edge_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_learning_graph_draft(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_learning_graph_draft(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.approve_learning_graph_draft(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_learning_graph_draft(uuid, uuid, text, text) TO service_role;

COMMENT ON TABLE public.learning_graph_nodes IS 'Versioned foundation for curriculum, skill and misconception graph nodes.';
COMMENT ON TABLE public.learning_graph_edges IS 'Human-verified semantic relationships between learning graph nodes.';
