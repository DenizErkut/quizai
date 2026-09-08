-- 029_learning_objective_review_publish.sql
-- Satır bazlı pedagojik inceleme ve kontrollü objective -> topic -> unit -> subject yayını.

ALTER TABLE public.learning_objective_import_items
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS selected_topic_node_id uuid REFERENCES public.learning_graph_nodes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.learning_objective_import_items
  DROP CONSTRAINT IF EXISTS learning_objective_import_items_review_status_check;
ALTER TABLE public.learning_objective_import_items
  ADD CONSTRAINT learning_objective_import_items_review_status_check
  CHECK (review_status IN ('pending', 'approved', 'rejected', 'published'));

ALTER TABLE public.learning_objective_import_batches
  DROP CONSTRAINT IF EXISTS learning_objective_import_batches_status_check;
ALTER TABLE public.learning_objective_import_batches
  ADD CONSTRAINT learning_objective_import_batches_status_check
  CHECK (status IN ('processing', 'validated', 'needs_correction', 'in_review',
                    'partially_published', 'published', 'rejected'));

ALTER TABLE public.learning_objective_catalog
  ADD COLUMN IF NOT EXISTS graph_node_id uuid UNIQUE REFERENCES public.learning_graph_nodes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS topic_node_id uuid REFERENCES public.learning_graph_nodes(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS learning_objective_import_items_review_idx
  ON public.learning_objective_import_items (batch_id, review_status, row_number);
CREATE INDEX IF NOT EXISTS learning_objective_catalog_topic_idx
  ON public.learning_objective_catalog (topic_node_id)
  WHERE topic_node_id IS NOT NULL AND is_active = true;

CREATE TABLE IF NOT EXISTS public.learning_objective_review_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES public.learning_objective_import_items(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.learning_objective_import_batches(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('approve', 'reject', 'reopen', 'publish')),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_objective_review_audit_item_idx
  ON public.learning_objective_review_audit (item_id, created_at DESC);
ALTER TABLE public.learning_objective_review_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_objective_review_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_objective_review_audit TO service_role;

-- Yalnızca tamamı doğrulanmış tekil topic -> unit -> subject zincirleri seçim hedefidir.
CREATE OR REPLACE VIEW public.learning_objective_publish_targets
WITH (security_invoker = true) AS
SELECT
  topic.id AS topic_node_id,
  topic.label AS topic,
  topic.grade,
  topic.level,
  unit.id AS unit_node_id,
  unit.label AS unit,
  subject.id AS subject_node_id,
  subject.label AS subject
FROM public.learning_graph_nodes topic
JOIN public.learning_graph_edges topic_unit
  ON topic_unit.source_node_id = topic.id
 AND topic_unit.edge_type = 'part_of' AND topic_unit.is_verified = true
JOIN public.learning_graph_nodes unit
  ON unit.id = topic_unit.target_node_id AND unit.node_type = 'unit' AND unit.is_active = true
JOIN public.learning_graph_edges unit_subject
  ON unit_subject.source_node_id = unit.id
 AND unit_subject.edge_type = 'part_of' AND unit_subject.is_verified = true
JOIN public.learning_graph_nodes subject
  ON subject.id = unit_subject.target_node_id AND subject.node_type = 'subject' AND subject.is_active = true
WHERE topic.node_type = 'topic' AND topic.is_active = true;

REVOKE ALL ON public.learning_objective_publish_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learning_objective_publish_targets TO service_role;

CREATE OR REPLACE FUNCTION public.review_learning_objective_import_item(
  p_item_id uuid,
  p_action text,
  p_reviewer_id uuid,
  p_topic_node_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.learning_objective_import_items%ROWTYPE;
  v_before jsonb;
  v_target public.learning_objective_publish_targets%ROWTYPE;
  v_objective_id uuid;
  v_objective_node_id uuid;
  v_published integer;
  v_rejected integer;
  v_approved integer;
  v_pending integer;
  v_invalid integer;
  v_total integer;
BEGIN
  IF p_action NOT IN ('approve', 'reject', 'reopen', 'publish') THEN
    RAISE EXCEPTION 'action must be approve, reject, reopen or publish';
  END IF;
  IF p_reviewer_id IS NULL THEN RAISE EXCEPTION 'reviewer is required'; END IF;

  SELECT * INTO v_item FROM public.learning_objective_import_items
  WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Import item not found'; END IF;
  v_before := to_jsonb(v_item);

  IF p_action = 'approve' THEN
    IF v_item.validation_status <> 'valid' THEN
      RAISE EXCEPTION 'Only structurally valid items can be approved';
    END IF;
    IF v_item.review_status NOT IN ('pending', 'rejected') THEN
      RAISE EXCEPTION 'Item is already %', v_item.review_status;
    END IF;
    IF p_topic_node_id IS NULL THEN RAISE EXCEPTION 'Verified topic target is required'; END IF;
    SELECT * INTO v_target FROM public.learning_objective_publish_targets
    WHERE topic_node_id = p_topic_node_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified topic -> unit -> subject chain not found'; END IF;
    IF public.canonical_learning_grade(v_item.grade) <> public.canonical_learning_grade(v_target.grade) THEN
      RAISE EXCEPTION 'Item grade (%) does not match target grade (%)', v_item.grade, v_target.grade;
    END IF;
    IF v_item.level IS NOT NULL AND v_target.level IS NOT NULL
       AND public.learning_dimension_key(v_item.level) <> public.learning_dimension_key(v_target.level) THEN
      RAISE EXCEPTION 'Item level (%) does not match target level (%)', v_item.level, v_target.level;
    END IF;
    UPDATE public.learning_objective_import_items SET
      title = coalesce(nullif(regexp_replace(btrim(p_title), '\s+', ' ', 'g'), ''), title),
      subject = v_target.subject, unit = v_target.unit, topic = v_target.topic,
      selected_topic_node_id = v_target.topic_node_id,
      review_status = 'approved', review_notes = nullif(btrim(p_notes), ''),
      reviewed_by = p_reviewer_id, reviewed_at = now(), updated_at = now()
    WHERE id = p_item_id;

  ELSIF p_action = 'reject' THEN
    IF v_item.review_status = 'published' THEN RAISE EXCEPTION 'Published item cannot be rejected'; END IF;
    IF char_length(btrim(coalesce(p_notes, ''))) < 3 THEN RAISE EXCEPTION 'Rejection note is required'; END IF;
    UPDATE public.learning_objective_import_items SET
      review_status = 'rejected', review_notes = btrim(p_notes),
      reviewed_by = p_reviewer_id, reviewed_at = now(), updated_at = now()
    WHERE id = p_item_id;

  ELSIF p_action = 'reopen' THEN
    IF v_item.review_status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'Only approved or rejected items can be reopened';
    END IF;
    UPDATE public.learning_objective_import_items SET
      review_status = 'pending', selected_topic_node_id = NULL,
      review_notes = NULL, reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
    WHERE id = p_item_id;

  ELSE
    IF v_item.review_status <> 'approved' OR v_item.selected_topic_node_id IS NULL THEN
      RAISE EXCEPTION 'Item must be approved before publication';
    END IF;
    SELECT * INTO v_target FROM public.learning_objective_publish_targets
    WHERE topic_node_id = v_item.selected_topic_node_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Verified publication chain is no longer valid'; END IF;

    INSERT INTO public.learning_graph_nodes
      (node_key, node_type, label, subject, grade, level, source_type, metadata, is_active)
    VALUES (
      'objective:catalog:' || md5(lower(v_item.objective_code)),
      'learning_objective', v_item.title, v_target.subject, v_target.grade,
      v_target.level, 'objective_import',
      jsonb_build_object('objective_code', v_item.objective_code,
        'source_reference', v_item.source_reference, 'import_item_id', v_item.id), true
    )
    ON CONFLICT (node_key) DO UPDATE SET
      label = EXCLUDED.label, subject = EXCLUDED.subject, grade = EXCLUDED.grade,
      level = EXCLUDED.level, metadata = EXCLUDED.metadata, is_active = true, updated_at = now()
    RETURNING id INTO v_objective_node_id;

    INSERT INTO public.learning_graph_edges
      (source_node_id, target_node_id, edge_type, confidence, rationale,
       source_type, is_verified, reviewed_by)
    VALUES (v_objective_node_id, v_target.topic_node_id, 'part_of', 1.000,
      'Satır bazında admin onaylı kazanım-konu bağlantısı',
      'objective_import', true, p_reviewer_id)
    ON CONFLICT (source_node_id, target_node_id, edge_type) DO UPDATE SET
      confidence = 1.000, rationale = EXCLUDED.rationale, source_type = EXCLUDED.source_type,
      is_verified = true, reviewed_by = EXCLUDED.reviewed_by, updated_at = now();

    INSERT INTO public.learning_objective_catalog
      (objective_code, title, level, grade, subject, unit, topic, source_type,
       source_reference, verification_status, metadata, is_active, graph_node_id, topic_node_id)
    VALUES (v_item.objective_code, v_item.title, v_target.level, v_target.grade,
      v_target.subject, v_target.unit, v_target.topic,
      (SELECT source_type FROM public.learning_objective_import_batches WHERE id = v_item.batch_id),
      v_item.source_reference, 'verified',
      jsonb_build_object('import_batch_id', v_item.batch_id, 'import_item_id', v_item.id,
        'reviewed_by', p_reviewer_id), true, v_objective_node_id, v_target.topic_node_id)
    ON CONFLICT (objective_code) DO NOTHING
    RETURNING id INTO v_objective_id;
    IF v_objective_id IS NULL THEN RAISE EXCEPTION 'Objective code is already published'; END IF;

    UPDATE public.learning_objective_import_items SET
      objective_id = v_objective_id, review_status = 'published',
      published_at = now(), updated_at = now()
    WHERE id = p_item_id;
  END IF;

  INSERT INTO public.learning_objective_review_audit
    (item_id, batch_id, action, actor_id, before_state, after_state)
  SELECT id, batch_id, p_action, p_reviewer_id, v_before, to_jsonb(i)
  FROM public.learning_objective_import_items i WHERE id = p_item_id;

  SELECT count(*)::integer,
    count(*) FILTER (WHERE validation_status = 'invalid')::integer,
    count(*) FILTER (WHERE review_status = 'pending' AND validation_status = 'valid')::integer,
    count(*) FILTER (WHERE review_status = 'approved')::integer,
    count(*) FILTER (WHERE review_status = 'rejected')::integer,
    count(*) FILTER (WHERE review_status = 'published')::integer
  INTO v_total, v_invalid, v_pending, v_approved, v_rejected, v_published
  FROM public.learning_objective_import_items WHERE batch_id = v_item.batch_id;

  UPDATE public.learning_objective_import_batches SET status = CASE
    WHEN v_published = v_total THEN 'published'
    WHEN v_rejected = v_total THEN 'rejected'
    WHEN v_published > 0 THEN 'partially_published'
    WHEN v_approved > 0 OR v_rejected > 0 THEN 'in_review'
    WHEN v_invalid > 0 THEN 'needs_correction'
    ELSE 'validated' END,
    updated_at = now()
  WHERE id = v_item.batch_id;

  RETURN (SELECT jsonb_build_object(
    'item_id', id, 'batch_id', batch_id, 'review_status', review_status,
    'objective_id', objective_id, 'topic_node_id', selected_topic_node_id)
    FROM public.learning_objective_import_items WHERE id = p_item_id);
END;
$$;

REVOKE ALL ON FUNCTION public.review_learning_objective_import_item(uuid, text, uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_learning_objective_import_item(uuid, text, uuid, uuid, text, text)
  TO service_role;

COMMENT ON FUNCTION public.review_learning_objective_import_item(uuid, text, uuid, uuid, text, text) IS
  'Reviews one staged objective and atomically publishes its catalog record and verified objective -> topic edge; service-role only.';

