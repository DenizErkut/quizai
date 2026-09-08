-- Learning Graph Relation Provenance & Versioning v1
-- Existing relations stay intact; every future mutation gains an append-only audit trail.

ALTER TABLE public.learning_graph_edges
  ADD COLUMN IF NOT EXISTS curriculum_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relation_version integer NOT NULL DEFAULT 1 CHECK (relation_version > 0),
  ADD COLUMN IF NOT EXISTS valid_from timestamptz,
  ADD COLUMN IF NOT EXISTS valid_to timestamptz;

UPDATE public.learning_graph_edges
SET valid_from = coalesce(valid_from, created_at)
WHERE valid_from IS NULL;

ALTER TABLE public.learning_graph_edges
  ALTER COLUMN valid_from SET DEFAULT now(),
  ALTER COLUMN valid_from SET NOT NULL;

CREATE INDEX IF NOT EXISTS learning_graph_edges_version_idx
  ON public.learning_graph_edges (curriculum_version_id, is_verified, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.learning_graph_edge_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edge_id uuid NOT NULL,
  relation_version integer NOT NULL CHECK (relation_version > 0),
  change_type text NOT NULL CHECK (change_type IN ('baseline', 'insert', 'update', 'delete')),
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  edge_type text NOT NULL,
  confidence numeric(4,3),
  rationale text,
  source_type text NOT NULL,
  is_verified boolean NOT NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  curriculum_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE SET NULL,
  valid_from timestamptz,
  valid_to timestamptz,
  snapshot jsonb NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_graph_edge_history_edge_idx
  ON public.learning_graph_edge_history (edge_id, relation_version DESC, changed_at DESC);
CREATE INDEX IF NOT EXISTS learning_graph_edge_history_version_idx
  ON public.learning_graph_edge_history (curriculum_version_id, changed_at DESC);

ALTER TABLE public.learning_graph_edge_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_graph_edge_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_graph_edge_history TO service_role;

INSERT INTO public.learning_graph_edge_history
  (edge_id, relation_version, change_type, source_node_id, target_node_id, edge_type,
   confidence, rationale, source_type, is_verified, reviewed_by, curriculum_version_id,
   valid_from, valid_to, snapshot, changed_at)
SELECT e.id, e.relation_version, 'baseline', e.source_node_id, e.target_node_id, e.edge_type,
  e.confidence, e.rationale, e.source_type, e.is_verified, e.reviewed_by,
  e.curriculum_version_id, e.valid_from, e.valid_to, to_jsonb(e), e.updated_at
FROM public.learning_graph_edges e
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_graph_edge_history h
  WHERE h.edge_id = e.id AND h.change_type = 'baseline'
);

CREATE OR REPLACE FUNCTION public.audit_learning_graph_edge_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_row public.learning_graph_edges%ROWTYPE; v_change text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) = to_jsonb(NEW) THEN RETURN NEW; END IF;
    v_row := NEW; v_change := 'update';
  ELSIF TG_OP = 'INSERT' THEN
    v_row := NEW; v_change := 'insert';
  ELSE
    v_row := OLD; v_change := 'delete';
  END IF;

  INSERT INTO public.learning_graph_edge_history
    (edge_id, relation_version, change_type, source_node_id, target_node_id, edge_type,
     confidence, rationale, source_type, is_verified, reviewed_by, curriculum_version_id,
     valid_from, valid_to, snapshot)
  VALUES (v_row.id, v_row.relation_version, v_change, v_row.source_node_id, v_row.target_node_id,
    v_row.edge_type, v_row.confidence, v_row.rationale, v_row.source_type, v_row.is_verified,
    v_row.reviewed_by, v_row.curriculum_version_id, v_row.valid_from, v_row.valid_to, to_jsonb(v_row));
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END; $$;

CREATE OR REPLACE FUNCTION public.version_learning_graph_edge_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
BEGIN
  IF to_jsonb(OLD) <> to_jsonb(NEW) THEN
    NEW.relation_version := OLD.relation_version + 1;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS learning_graph_edge_audit_v1 ON public.learning_graph_edges;
DROP TRIGGER IF EXISTS learning_graph_edge_version_v1 ON public.learning_graph_edges;
CREATE TRIGGER learning_graph_edge_version_v1
BEFORE UPDATE ON public.learning_graph_edges
FOR EACH ROW EXECUTE FUNCTION public.version_learning_graph_edge_v1();
CREATE TRIGGER learning_graph_edge_audit_v1
AFTER INSERT OR UPDATE OR DELETE ON public.learning_graph_edges
FOR EACH ROW EXECUTE FUNCTION public.audit_learning_graph_edge_v1();

REVOKE ALL ON FUNCTION public.audit_learning_graph_edge_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.version_learning_graph_edge_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_learning_graph_edge_v1() TO service_role;
GRANT EXECUTE ON FUNCTION public.version_learning_graph_edge_v1() TO service_role;

COMMENT ON TABLE public.learning_graph_edge_history IS
  'Append-only provenance and publication history for Learning Graph relations.';
