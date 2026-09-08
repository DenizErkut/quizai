-- Curriculum Versioning & Objective Lifecycle v1.
-- Stable objective ids preserve historical Learning Events; immutable revisions
-- carry curriculum-specific content. Draft curricula cannot leak into generation.

CREATE TABLE IF NOT EXISTS public.curriculum_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  authority text NOT NULL DEFAULT 'MEB' CHECK (char_length(btrim(authority)) BETWEEN 2 AND 80),
  academic_year_start smallint NOT NULL CHECK (academic_year_start BETWEEN 2000 AND 2200),
  academic_year_end smallint NOT NULL CHECK (academic_year_end = academic_year_start + 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  effective_from date NOT NULL,
  effective_to date NOT NULL CHECK (effective_to >= effective_from),
  source_reference text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curriculum_versions_authority_code_unique UNIQUE (authority, code)
);

CREATE UNIQUE INDEX IF NOT EXISTS curriculum_versions_one_active_authority_idx
  ON public.curriculum_versions (lower(authority)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS curriculum_versions_status_year_idx
  ON public.curriculum_versions (status, academic_year_start DESC);

ALTER TABLE public.curriculum_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.curriculum_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.curriculum_versions TO service_role;

INSERT INTO public.curriculum_versions
  (code, title, authority, academic_year_start, academic_year_end, status,
   effective_from, effective_to, source_reference, metadata)
SELECT 'MEB-2026-2027', '2026–2027 MEB Müfredatı', 'MEB', 2026, 2027, 'active',
       DATE '2026-09-01', DATE '2027-08-31', 'Pratium başlangıç sürümü',
       jsonb_build_object('seeded_by', '032_curriculum_versioning_objective_lifecycle_v1')
WHERE NOT EXISTS (SELECT 1 FROM public.curriculum_versions
  WHERE lower(authority) = 'meb' AND status = 'active')
ON CONFLICT (authority, code) DO UPDATE SET
  status = 'active', effective_from = EXCLUDED.effective_from,
  effective_to = EXCLUDED.effective_to, updated_at = now();

ALTER TABLE public.learning_objective_catalog
  ADD COLUMN IF NOT EXISTS curriculum_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_to date,
  ADD COLUMN IF NOT EXISTS replaced_by_objective_id uuid REFERENCES public.learning_objective_catalog(id) ON DELETE RESTRICT;

ALTER TABLE public.learning_objective_catalog
  DROP CONSTRAINT IF EXISTS learning_objective_catalog_lifecycle_status_check;
ALTER TABLE public.learning_objective_catalog
  ADD CONSTRAINT learning_objective_catalog_lifecycle_status_check
  CHECK (lifecycle_status IN ('draft', 'active', 'superseded', 'retired'));
ALTER TABLE public.learning_objective_catalog
  DROP CONSTRAINT IF EXISTS learning_objective_catalog_validity_check;
ALTER TABLE public.learning_objective_catalog
  ADD CONSTRAINT learning_objective_catalog_validity_check
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from);

UPDATE public.learning_objective_catalog c SET
  curriculum_version_id = v.id,
  valid_from = coalesce(c.valid_from, v.effective_from),
  lifecycle_status = CASE WHEN c.is_active THEN 'active' ELSE 'retired' END
FROM public.curriculum_versions v
WHERE c.curriculum_version_id IS NULL AND v.status = 'active'
  AND lower(v.authority) = 'meb';

ALTER TABLE public.learning_objective_import_batches
  ADD COLUMN IF NOT EXISTS curriculum_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE RESTRICT;
UPDATE public.learning_objective_import_batches b SET curriculum_version_id = v.id
FROM public.curriculum_versions v
WHERE b.curriculum_version_id IS NULL AND v.status = 'active'
  AND lower(v.authority) = 'meb';

CREATE TABLE IF NOT EXISTS public.learning_objective_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  objective_id uuid NOT NULL REFERENCES public.learning_objective_catalog(id) ON DELETE RESTRICT,
  curriculum_version_id uuid NOT NULL REFERENCES public.curriculum_versions(id) ON DELETE RESTRICT,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  revision_status text NOT NULL DEFAULT 'draft' CHECK (revision_status IN ('draft', 'published', 'withdrawn')),
  objective_code text NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) >= 3),
  level text NOT NULL,
  grade text NOT NULL,
  subject text NOT NULL,
  unit text,
  topic text,
  topic_node_id uuid NOT NULL REFERENCES public.learning_graph_nodes(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('meb', 'manual', 'import')),
  source_reference text,
  content_hash text NOT NULL,
  change_reason text NOT NULL CHECK (char_length(btrim(change_reason)) >= 3),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_objective_revisions_number_unique UNIQUE (objective_id, revision_number),
  CONSTRAINT learning_objective_revisions_version_unique UNIQUE (objective_id, curriculum_version_id)
);

CREATE INDEX IF NOT EXISTS learning_objective_revisions_version_status_idx
  ON public.learning_objective_revisions (curriculum_version_id, revision_status, objective_id);
ALTER TABLE public.learning_objective_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_objective_revisions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_objective_revisions TO service_role;

ALTER TABLE public.learning_objective_catalog
  ADD COLUMN IF NOT EXISTS current_revision_id uuid REFERENCES public.learning_objective_revisions(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.learning_objective_lifecycle_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  objective_id uuid NOT NULL REFERENCES public.learning_objective_catalog(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('create', 'draft_revision', 'publish_revision', 'supersede', 'retire', 'reactivate')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 3),
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_objective_lifecycle_audit_objective_idx
  ON public.learning_objective_lifecycle_audit (objective_id, created_at DESC);
ALTER TABLE public.learning_objective_lifecycle_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_objective_lifecycle_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_objective_lifecycle_audit TO service_role;

-- Backfill any catalog records created before this migration.
INSERT INTO public.learning_objective_revisions
  (objective_id, curriculum_version_id, revision_number, revision_status,
   objective_code, title, level, grade, subject, unit, topic, topic_node_id,
   source_type, source_reference, content_hash, change_reason, published_at, created_at)
SELECT c.id, c.curriculum_version_id, 1,
  CASE WHEN c.is_active AND c.verification_status = 'verified' THEN 'published' ELSE 'withdrawn' END,
  c.objective_code, c.title, c.level, c.grade, c.subject, c.unit, c.topic, c.topic_node_id,
  c.source_type, c.source_reference,
  md5(concat_ws('|', c.objective_code, c.title, c.level, c.grade, c.subject,
    coalesce(c.unit, ''), coalesce(c.topic, ''), c.topic_node_id::text)),
  'Sürümleme başlangıç kaydı', CASE WHEN c.is_active THEN c.created_at END, c.created_at
FROM public.learning_objective_catalog c
WHERE c.curriculum_version_id IS NOT NULL AND c.topic_node_id IS NOT NULL
ON CONFLICT (objective_id, curriculum_version_id) DO NOTHING;

UPDATE public.learning_objective_catalog c SET current_revision_id = r.id
FROM public.learning_objective_revisions r
WHERE r.objective_id = c.id AND r.curriculum_version_id = c.curriculum_version_id
  AND c.current_revision_id IS NULL;

CREATE INDEX IF NOT EXISTS learning_objective_catalog_version_lifecycle_idx
  ON public.learning_objective_catalog (curriculum_version_id, lifecycle_status, subject, grade)
  WHERE verification_status = 'verified';
CREATE INDEX IF NOT EXISTS learning_objective_catalog_replacement_idx
  ON public.learning_objective_catalog (replaced_by_objective_id)
  WHERE replaced_by_objective_id IS NOT NULL;

-- Every future catalog insert receives a curriculum version and immutable first revision.
CREATE OR REPLACE FUNCTION public.prepare_learning_objective_version_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_version public.curriculum_versions%ROWTYPE;
BEGIN
  IF NEW.curriculum_version_id IS NULL AND NEW.metadata ? 'import_batch_id' THEN
    SELECT v.* INTO v_version FROM public.curriculum_versions v
    JOIN public.learning_objective_import_batches b ON b.curriculum_version_id = v.id
    WHERE b.id = (NEW.metadata->>'import_batch_id')::uuid;
  ELSIF NEW.curriculum_version_id IS NOT NULL THEN
    SELECT * INTO v_version FROM public.curriculum_versions WHERE id = NEW.curriculum_version_id;
  ELSE
    SELECT * INTO v_version FROM public.curriculum_versions
    WHERE status = 'active' AND lower(authority) = 'meb';
  END IF;
  IF v_version.id IS NULL OR v_version.status = 'retired' THEN
    RAISE EXCEPTION 'An active or draft curriculum version is required';
  END IF;
  NEW.curriculum_version_id := v_version.id;
  NEW.valid_from := coalesce(NEW.valid_from, v_version.effective_from);
  NEW.lifecycle_status := CASE WHEN v_version.status = 'active' THEN 'active' ELSE 'draft' END;
  NEW.is_active := v_version.status = 'active' AND NEW.verification_status = 'verified';
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.create_learning_objective_initial_revision_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_revision_id uuid; v_version_status text;
BEGIN
  SELECT status INTO v_version_status FROM public.curriculum_versions WHERE id = NEW.curriculum_version_id;
  INSERT INTO public.learning_objective_revisions
    (objective_id, curriculum_version_id, revision_number, revision_status,
     objective_code, title, level, grade, subject, unit, topic, topic_node_id,
     source_type, source_reference, content_hash, change_reason, created_by, published_at)
  VALUES (NEW.id, NEW.curriculum_version_id, 1,
    CASE WHEN v_version_status = 'active' THEN 'published' ELSE 'draft' END,
    NEW.objective_code, NEW.title, NEW.level, NEW.grade, NEW.subject, NEW.unit, NEW.topic,
    NEW.topic_node_id, NEW.source_type, NEW.source_reference,
    md5(concat_ws('|', NEW.objective_code, NEW.title, NEW.level, NEW.grade, NEW.subject,
      coalesce(NEW.unit, ''), coalesce(NEW.topic, ''), NEW.topic_node_id::text)),
    'İlk kontrollü yayın', nullif(NEW.metadata->>'reviewed_by', '')::uuid,
    CASE WHEN v_version_status = 'active' THEN now() END)
  RETURNING id INTO v_revision_id;
  UPDATE public.learning_objective_catalog SET current_revision_id = v_revision_id WHERE id = NEW.id;
  UPDATE public.learning_graph_nodes SET
    is_active = NEW.is_active,
    metadata = metadata || jsonb_build_object('curriculum_version_id', NEW.curriculum_version_id,
      'objective_revision_id', v_revision_id), updated_at = now()
  WHERE id = NEW.graph_node_id;
  INSERT INTO public.learning_objective_lifecycle_audit
    (objective_id, action, actor_id, reason, before_state, after_state)
  VALUES (NEW.id, 'create', nullif(NEW.metadata->>'reviewed_by', '')::uuid,
    'İlk kontrollü yayın', '{}'::jsonb,
    jsonb_build_object('curriculum_version_id', NEW.curriculum_version_id,
      'revision_id', v_revision_id, 'lifecycle_status', NEW.lifecycle_status));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS learning_objective_prepare_version_v1 ON public.learning_objective_catalog;
CREATE TRIGGER learning_objective_prepare_version_v1
BEFORE INSERT ON public.learning_objective_catalog
FOR EACH ROW EXECUTE FUNCTION public.prepare_learning_objective_version_v1();
DROP TRIGGER IF EXISTS learning_objective_initial_revision_v1 ON public.learning_objective_catalog;
CREATE TRIGGER learning_objective_initial_revision_v1
AFTER INSERT ON public.learning_objective_catalog
FOR EACH ROW EXECUTE FUNCTION public.create_learning_objective_initial_revision_v1();

CREATE OR REPLACE FUNCTION public.stage_learning_objective_import_v2(
  p_source_type text, p_source_reference text, p_created_by uuid,
  p_curriculum_version_id uuid, p_rows jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_result jsonb; v_status text;
BEGIN
  SELECT status INTO v_status FROM public.curriculum_versions WHERE id = p_curriculum_version_id FOR SHARE;
  IF v_status IS NULL OR v_status = 'retired' THEN
    RAISE EXCEPTION 'Active or draft curriculum version is required';
  END IF;
  v_result := public.stage_learning_objective_import(
    p_source_type, p_source_reference, p_created_by, p_rows);
  UPDATE public.learning_objective_import_batches
  SET curriculum_version_id = p_curriculum_version_id, updated_at = now()
  WHERE id = (v_result->>'batch_id')::uuid;
  RETURN v_result || jsonb_build_object('curriculum_version_id', p_curriculum_version_id);
END; $$;

CREATE OR REPLACE FUNCTION public.create_learning_objective_revision_v1(
  p_objective_id uuid, p_curriculum_version_id uuid, p_reviewer_id uuid,
  p_title text, p_topic_node_id uuid, p_source_reference text, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_objective public.learning_objective_catalog%ROWTYPE;
  v_target public.learning_objective_publish_targets%ROWTYPE;
  v_version_status text; v_revision_id uuid; v_revision_number integer;
BEGIN
  IF p_reviewer_id IS NULL OR char_length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Reviewer and change reason are required';
  END IF;
  SELECT * INTO v_objective FROM public.learning_objective_catalog WHERE id = p_objective_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
  SELECT status INTO v_version_status FROM public.curriculum_versions
  WHERE id = p_curriculum_version_id FOR SHARE;
  IF v_version_status IS NULL OR v_version_status = 'retired' THEN
    RAISE EXCEPTION 'Active or draft curriculum version is required';
  END IF;
  SELECT * INTO v_target FROM public.learning_objective_publish_targets WHERE topic_node_id = p_topic_node_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verified topic -> unit -> subject chain not found'; END IF;
  IF public.canonical_learning_grade(v_objective.grade) <> public.canonical_learning_grade(v_target.grade) THEN
    RAISE EXCEPTION 'Objective and target grades do not match';
  END IF;
  IF EXISTS (SELECT 1 FROM public.learning_objective_revisions
    WHERE objective_id = p_objective_id AND curriculum_version_id = p_curriculum_version_id) THEN
    RAISE EXCEPTION 'Objective already has a revision for this curriculum version';
  END IF;
  SELECT coalesce(max(revision_number), 0) + 1 INTO v_revision_number
  FROM public.learning_objective_revisions WHERE objective_id = p_objective_id;
  INSERT INTO public.learning_objective_revisions
    (objective_id, curriculum_version_id, revision_number, revision_status,
     objective_code, title, level, grade, subject, unit, topic, topic_node_id,
     source_type, source_reference, content_hash, change_reason, created_by, published_at)
  VALUES (v_objective.id, p_curriculum_version_id, v_revision_number,
    CASE WHEN v_version_status = 'active' THEN 'published' ELSE 'draft' END,
    v_objective.objective_code, regexp_replace(btrim(p_title), '\s+', ' ', 'g'),
    v_target.level, v_target.grade, v_target.subject, v_target.unit, v_target.topic,
    v_target.topic_node_id, v_objective.source_type,
    coalesce(nullif(btrim(p_source_reference), ''), v_objective.source_reference),
    md5(concat_ws('|', v_objective.objective_code, regexp_replace(btrim(p_title), '\s+', ' ', 'g'),
      v_target.level, v_target.grade, v_target.subject, v_target.unit, v_target.topic, v_target.topic_node_id::text)),
    btrim(p_reason), p_reviewer_id, CASE WHEN v_version_status = 'active' THEN now() END)
  RETURNING id INTO v_revision_id;
  IF v_version_status = 'active' THEN
    UPDATE public.learning_objective_revisions SET revision_status = 'withdrawn'
    WHERE objective_id = p_objective_id AND id <> v_revision_id AND revision_status = 'published';
    UPDATE public.learning_objective_catalog SET
      title = regexp_replace(btrim(p_title), '\s+', ' ', 'g'), level = v_target.level,
      grade = v_target.grade, subject = v_target.subject, unit = v_target.unit,
      topic = v_target.topic, topic_node_id = v_target.topic_node_id,
      source_reference = coalesce(nullif(btrim(p_source_reference), ''), source_reference),
      curriculum_version_id = p_curriculum_version_id, current_revision_id = v_revision_id,
      lifecycle_status = 'active', is_active = true, valid_from = current_date,
      valid_to = NULL, replaced_by_objective_id = NULL, updated_at = now()
    WHERE id = p_objective_id;
    UPDATE public.learning_graph_edges SET is_verified = false, updated_at = now()
    WHERE source_node_id = v_objective.graph_node_id AND edge_type = 'part_of';
    INSERT INTO public.learning_graph_edges
      (source_node_id, target_node_id, edge_type, confidence, rationale, source_type, is_verified, reviewed_by)
    VALUES (v_objective.graph_node_id, v_target.topic_node_id, 'part_of', 1.000,
      'Aktif müfredat revizyonundaki admin onaylı bağlantı', 'objective_revision', true, p_reviewer_id)
    ON CONFLICT (source_node_id, target_node_id, edge_type) DO UPDATE SET
      confidence = 1.000, rationale = EXCLUDED.rationale, source_type = EXCLUDED.source_type,
      is_verified = true, reviewed_by = EXCLUDED.reviewed_by, updated_at = now();
  END IF;
  INSERT INTO public.learning_objective_lifecycle_audit
    (objective_id, action, actor_id, reason, before_state, after_state)
  VALUES (p_objective_id, CASE WHEN v_version_status = 'active' THEN 'publish_revision' ELSE 'draft_revision' END,
    p_reviewer_id, btrim(p_reason), to_jsonb(v_objective),
    jsonb_build_object('revision_id', v_revision_id, 'revision_number', v_revision_number,
      'curriculum_version_id', p_curriculum_version_id, 'revision_status',
      CASE WHEN v_version_status = 'active' THEN 'published' ELSE 'draft' END));
  RETURN jsonb_build_object('objective_id', p_objective_id, 'revision_id', v_revision_id,
    'revision_number', v_revision_number, 'status',
    CASE WHEN v_version_status = 'active' THEN 'published' ELSE 'draft' END);
END; $$;

CREATE OR REPLACE FUNCTION public.transition_learning_objective_lifecycle_v1(
  p_objective_id uuid, p_action text, p_actor_id uuid,
  p_reason text, p_replacement_objective_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_objective public.learning_objective_catalog%ROWTYPE;
  v_replacement public.learning_objective_catalog%ROWTYPE;
BEGIN
  IF p_action NOT IN ('retire', 'supersede', 'reactivate') THEN
    RAISE EXCEPTION 'Action must be retire, supersede or reactivate';
  END IF;
  IF p_actor_id IS NULL OR char_length(btrim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Actor and reason are required';
  END IF;
  SELECT * INTO v_objective FROM public.learning_objective_catalog WHERE id = p_objective_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
  IF p_action = 'supersede' THEN
    IF p_replacement_objective_id IS NULL OR p_replacement_objective_id = p_objective_id THEN
      RAISE EXCEPTION 'A different replacement objective is required';
    END IF;
    SELECT * INTO v_replacement FROM public.learning_objective_catalog
    WHERE id = p_replacement_objective_id AND is_active = true
      AND lifecycle_status = 'active' AND verification_status = 'verified';
    IF NOT FOUND THEN RAISE EXCEPTION 'Replacement objective must be active and verified'; END IF;
    UPDATE public.learning_objective_catalog SET lifecycle_status = 'superseded',
      is_active = false, valid_to = greatest(current_date, coalesce(valid_from, current_date)),
      replaced_by_objective_id = p_replacement_objective_id, updated_at = now()
    WHERE id = p_objective_id;
  ELSIF p_action = 'retire' THEN
    UPDATE public.learning_objective_catalog SET lifecycle_status = 'retired',
      is_active = false, valid_to = greatest(current_date, coalesce(valid_from, current_date)),
      replaced_by_objective_id = NULL, updated_at = now()
    WHERE id = p_objective_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.curriculum_versions
      WHERE id = v_objective.curriculum_version_id AND status = 'active') THEN
      RAISE EXCEPTION 'Only an objective in the active curriculum can be reactivated';
    END IF;
    UPDATE public.learning_objective_catalog SET lifecycle_status = 'active',
      is_active = true, valid_to = NULL, replaced_by_objective_id = NULL, updated_at = now()
    WHERE id = p_objective_id;
  END IF;
  UPDATE public.learning_graph_nodes SET is_active = (p_action = 'reactivate'), updated_at = now()
  WHERE id = v_objective.graph_node_id;
  UPDATE public.learning_graph_edges SET is_verified = (p_action = 'reactivate'), updated_at = now()
  WHERE source_node_id = v_objective.graph_node_id AND edge_type = 'part_of'
    AND target_node_id = v_objective.topic_node_id;
  INSERT INTO public.learning_objective_lifecycle_audit
    (objective_id, action, actor_id, reason, before_state, after_state)
  SELECT id, p_action, p_actor_id, btrim(p_reason), to_jsonb(v_objective), to_jsonb(c)
  FROM public.learning_objective_catalog c WHERE id = p_objective_id;
  RETURN (SELECT jsonb_build_object('objective_id', id, 'lifecycle_status', lifecycle_status,
    'is_active', is_active, 'replaced_by_objective_id', replaced_by_objective_id)
    FROM public.learning_objective_catalog WHERE id = p_objective_id);
END; $$;

CREATE OR REPLACE FUNCTION public.create_curriculum_version_v1(
  p_code text, p_title text, p_authority text, p_year_start integer,
  p_effective_from date, p_effective_to date, p_source_reference text, p_actor_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  IF p_actor_id IS NULL OR p_year_start NOT BETWEEN 2000 AND 2200
     OR p_effective_to < p_effective_from THEN RAISE EXCEPTION 'Invalid curriculum version data'; END IF;
  INSERT INTO public.curriculum_versions
    (code, title, authority, academic_year_start, academic_year_end, status,
     effective_from, effective_to, source_reference, created_by)
  VALUES (btrim(p_code), btrim(p_title), coalesce(nullif(btrim(p_authority), ''), 'MEB'),
    p_year_start, p_year_start + 1, 'draft', p_effective_from, p_effective_to,
    nullif(btrim(p_source_reference), ''), p_actor_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- Activating a new version is deliberately strict: every currently active
-- objective must have a prepared revision in the target version.
CREATE OR REPLACE FUNCTION public.activate_curriculum_version_v1(
  p_version_id uuid, p_actor_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_version public.curriculum_versions%ROWTYPE; v_missing integer; v_revision record;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'Actor is required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('curriculum_version_activation'));
  SELECT * INTO v_version FROM public.curriculum_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND OR v_version.status <> 'draft' THEN RAISE EXCEPTION 'Draft curriculum version not found'; END IF;
  SELECT count(*) INTO v_missing FROM public.learning_objective_catalog c
  WHERE c.is_active = true AND c.lifecycle_status = 'active'
    AND NOT EXISTS (SELECT 1 FROM public.learning_objective_revisions prepared
      WHERE prepared.objective_id = c.id AND prepared.curriculum_version_id = p_version_id
        AND prepared.revision_status = 'draft');
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% active objectives have no prepared revision in target curriculum', v_missing;
  END IF;
  UPDATE public.curriculum_versions SET status = 'retired', retired_at = now(), updated_at = now()
  WHERE lower(authority) = lower(v_version.authority) AND status = 'active';
  UPDATE public.curriculum_versions SET status = 'active', activated_by = p_actor_id,
    activated_at = now(), retired_at = NULL, updated_at = now() WHERE id = p_version_id;
  UPDATE public.learning_objective_revisions SET revision_status = 'withdrawn'
  WHERE revision_status = 'published' AND curriculum_version_id <> p_version_id;
  UPDATE public.learning_objective_revisions SET revision_status = 'published', published_at = now()
  WHERE curriculum_version_id = p_version_id AND revision_status = 'draft';
  FOR v_revision IN SELECT * FROM public.learning_objective_revisions
    WHERE curriculum_version_id = p_version_id AND revision_status = 'published'
  LOOP
    INSERT INTO public.learning_objective_lifecycle_audit
      (objective_id, action, actor_id, reason, before_state, after_state)
    SELECT c.id, 'publish_revision', p_actor_id,
      'Müfredat sürümü etkinleştirildi: ' || v_version.code, to_jsonb(c),
      jsonb_build_object('curriculum_version_id', p_version_id,
        'current_revision_id', v_revision.id, 'lifecycle_status', 'active', 'is_active', true)
    FROM public.learning_objective_catalog c WHERE c.id = v_revision.objective_id;
    UPDATE public.learning_objective_catalog SET
      title = v_revision.title, level = v_revision.level, grade = v_revision.grade, subject = v_revision.subject,
      unit = v_revision.unit, topic = v_revision.topic, topic_node_id = v_revision.topic_node_id,
      source_reference = v_revision.source_reference, curriculum_version_id = p_version_id,
      current_revision_id = v_revision.id, lifecycle_status = 'active', is_active = true,
      valid_from = v_version.effective_from, valid_to = NULL,
      replaced_by_objective_id = NULL, updated_at = now()
    WHERE id = v_revision.objective_id;
    UPDATE public.learning_graph_nodes SET label = v_revision.title, subject = v_revision.subject,
      grade = v_revision.grade, level = v_revision.level, is_active = true,
      metadata = metadata || jsonb_build_object('curriculum_version_id', p_version_id,
        'objective_revision_id', v_revision.id), updated_at = now()
    WHERE id = (SELECT graph_node_id FROM public.learning_objective_catalog WHERE id = v_revision.objective_id);
    UPDATE public.learning_graph_edges SET is_verified = false, updated_at = now()
    WHERE source_node_id = (SELECT graph_node_id FROM public.learning_objective_catalog WHERE id = v_revision.objective_id)
      AND edge_type = 'part_of';
    INSERT INTO public.learning_graph_edges
      (source_node_id, target_node_id, edge_type, confidence, rationale, source_type, is_verified, reviewed_by)
    VALUES ((SELECT graph_node_id FROM public.learning_objective_catalog WHERE id = v_revision.objective_id),
      v_revision.topic_node_id, 'part_of', 1.000, 'Etkin müfredat sürümündeki admin onaylı bağlantı',
      'objective_revision', true, p_actor_id)
    ON CONFLICT (source_node_id, target_node_id, edge_type) DO UPDATE SET
      confidence = 1.000, rationale = EXCLUDED.rationale, source_type = EXCLUDED.source_type,
      is_verified = true, reviewed_by = EXCLUDED.reviewed_by, updated_at = now();
  END LOOP;
  RETURN jsonb_build_object('version_id', p_version_id, 'status', 'active',
    'published_revisions', (SELECT count(*) FROM public.learning_objective_revisions
      WHERE curriculum_version_id = p_version_id AND revision_status = 'published'));
END; $$;

-- Attach the exact curriculum/revision to immutable Learning Event metadata.
CREATE OR REPLACE FUNCTION public.validate_learning_event_objective_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_objective public.learning_objective_catalog%ROWTYPE;
BEGIN
  IF NEW.learning_objective_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.learning_objective_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    NEW.learning_objective_id := NULL;
  ELSE
    SELECT * INTO v_objective FROM public.learning_objective_catalog
    WHERE id::text = NEW.learning_objective_id AND verification_status = 'verified'
      AND is_active = true AND lifecycle_status = 'active';
    IF NOT FOUND THEN NEW.learning_objective_id := NULL; END IF;
  END IF;
  IF NEW.learning_objective_id IS NULL THEN
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('objective_mapping_status', 'rejected_by_catalog_guard');
  ELSE
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object(
      'objective_mapping_status', 'verified', 'objective_mapping_version', 'v1',
      'curriculum_version_id', v_objective.curriculum_version_id,
      'learning_objective_revision_id', v_objective.current_revision_id);
  END IF;
  RETURN NEW;
END; $$;

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS curriculum_version_id uuid REFERENCES public.curriculum_versions(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS quiz_sessions_curriculum_version_idx
  ON public.quiz_sessions (curriculum_version_id, created_at DESC)
  WHERE curriculum_version_id IS NOT NULL;

REVOKE ALL ON FUNCTION public.prepare_learning_objective_version_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_learning_objective_initial_revision_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stage_learning_objective_import_v2(text, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_learning_objective_revision_v1(uuid, uuid, uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_learning_objective_lifecycle_v1(uuid, text, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_curriculum_version_v1(text, text, text, integer, date, date, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_curriculum_version_v1(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_learning_objective_import_v2(text, text, uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_learning_objective_revision_v1(uuid, uuid, uuid, text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_learning_objective_lifecycle_v1(uuid, text, uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_curriculum_version_v1(text, text, text, integer, date, date, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_curriculum_version_v1(uuid, uuid) TO service_role;

COMMENT ON TABLE public.curriculum_versions IS 'Controlled curriculum releases; only active versions may drive quiz generation.';
COMMENT ON TABLE public.learning_objective_revisions IS 'Immutable curriculum-specific snapshots behind stable objective identities.';
COMMENT ON TABLE public.learning_objective_lifecycle_audit IS 'Append-only reasoned audit of objective creation, revisions and lifecycle transitions.';
