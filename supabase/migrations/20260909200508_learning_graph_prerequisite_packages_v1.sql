-- Expert-reviewed Learning Graph prerequisite packages.

CREATE TABLE IF NOT EXISTS public.learning_graph_prerequisite_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 3 AND 160),
  subject text NOT NULL,
  grade text NOT NULL,
  curriculum_version_id uuid NOT NULL REFERENCES public.curriculum_versions(id) ON DELETE RESTRICT,
  source_reference text NOT NULL CHECK (length(btrim(source_reference)) >= 3),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','ready','published','rejected')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  published_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_graph_prerequisite_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.learning_graph_prerequisite_packages(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.learning_graph_nodes(id) ON DELETE RESTRICT,
  target_node_id uuid NOT NULL REFERENCES public.learning_graph_nodes(id) ON DELETE RESTRICT,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  rationale text NOT NULL CHECK (length(btrim(rationale)) >= 5),
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected','published')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_note text,
  reviewed_at timestamptz,
  edge_id uuid REFERENCES public.learning_graph_edges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_graph_prerequisite_items_distinct CHECK (source_node_id <> target_node_id),
  CONSTRAINT learning_graph_prerequisite_items_unique UNIQUE (package_id, source_node_id, target_node_id)
);

CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_packages_status_idx
  ON public.learning_graph_prerequisite_packages(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_items_package_status_idx
  ON public.learning_graph_prerequisite_items(package_id, review_status);

ALTER TABLE public.learning_graph_prerequisite_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_graph_prerequisite_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_graph_prerequisite_packages,
  public.learning_graph_prerequisite_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_graph_prerequisite_packages,
  public.learning_graph_prerequisite_items TO service_role;

CREATE OR REPLACE FUNCTION public.create_learning_graph_prerequisite_package_v1(
  p_name text, p_subject text, p_grade text, p_curriculum_version_id uuid,
  p_source_reference text, p_created_by uuid, p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_package_id uuid; v_item jsonb; v_source public.learning_graph_nodes%ROWTYPE;
  v_target public.learning_graph_nodes%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'En az bir ön koşul bağlantısı gerekli';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curriculum_versions WHERE id=p_curriculum_version_id) THEN
    RAISE EXCEPTION 'Müfredat sürümü bulunamadı';
  END IF;

  INSERT INTO public.learning_graph_prerequisite_packages
    (name,subject,grade,curriculum_version_id,source_reference,status,created_by)
  VALUES (btrim(p_name),btrim(p_subject),btrim(p_grade),p_curriculum_version_id,
    btrim(p_source_reference),'in_review',p_created_by)
  RETURNING id INTO v_package_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_source FROM public.learning_graph_nodes
      WHERE id=(v_item->>'source_node_id')::uuid AND is_active FOR SHARE;
    SELECT * INTO v_target FROM public.learning_graph_nodes
      WHERE id=(v_item->>'target_node_id')::uuid AND is_active FOR SHARE;
    IF NOT FOUND OR v_source.id IS NULL OR v_target.id IS NULL THEN
      RAISE EXCEPTION 'Aktif kaynak veya hedef düğüm bulunamadı';
    END IF;
    IF v_source.node_type NOT IN ('topic','learning_objective')
       OR v_target.node_type NOT IN ('topic','learning_objective') THEN
      RAISE EXCEPTION 'Ön koşul yalnızca konu veya kazanım düğümleri arasında kurulabilir';
    END IF;
    IF public.learning_dimension_key(v_source.subject) <> public.learning_dimension_key(p_subject)
       OR public.learning_dimension_key(v_target.subject) <> public.learning_dimension_key(p_subject)
       OR public.canonical_learning_grade(v_source.grade) <> public.canonical_learning_grade(p_grade)
       OR public.canonical_learning_grade(v_target.grade) <> public.canonical_learning_grade(p_grade) THEN
      RAISE EXCEPTION 'Paket ile düğümlerin ders/sınıf bilgisi uyuşmuyor';
    END IF;
    INSERT INTO public.learning_graph_prerequisite_items
      (package_id,source_node_id,target_node_id,confidence,rationale)
    VALUES (v_package_id,v_source.id,v_target.id,
      greatest(0,least(1,coalesce((v_item->>'confidence')::numeric,0.8))),
      btrim(v_item->>'rationale'));
  END LOOP;
  RETURN v_package_id;
END; $$;

CREATE OR REPLACE FUNCTION public.review_learning_graph_prerequisite_item_v1(
  p_item_id uuid, p_decision text, p_reviewer_id uuid, p_review_note text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_package_id uuid; v_status text;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Geçersiz karar'; END IF;
  IF p_decision='rejected' AND length(btrim(coalesce(p_review_note,''))) < 5 THEN
    RAISE EXCEPTION 'Ret gerekçesi gerekli';
  END IF;
  UPDATE public.learning_graph_prerequisite_items SET review_status=p_decision,
    reviewer_id=p_reviewer_id, review_note=nullif(btrim(p_review_note),''),
    reviewed_at=now(), updated_at=now()
  WHERE id=p_item_id AND review_status IN ('pending','approved','rejected')
  RETURNING package_id INTO v_package_id;
  IF v_package_id IS NULL THEN RAISE EXCEPTION 'İncelenebilir bağlantı bulunamadı'; END IF;

  SELECT CASE WHEN count(*) FILTER (WHERE review_status='pending')=0
    THEN 'ready' ELSE 'in_review' END INTO v_status
  FROM public.learning_graph_prerequisite_items WHERE package_id=v_package_id;
  UPDATE public.learning_graph_prerequisite_packages SET status=v_status,updated_at=now()
    WHERE id=v_package_id AND status <> 'published';
  RETURN v_status;
END; $$;

CREATE OR REPLACE FUNCTION public.publish_learning_graph_prerequisite_package_v1(
  p_package_id uuid, p_publisher_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_package public.learning_graph_prerequisite_packages%ROWTYPE;
  v_item public.learning_graph_prerequisite_items%ROWTYPE; v_edge_id uuid; v_count integer:=0;
BEGIN
  SELECT * INTO v_package FROM public.learning_graph_prerequisite_packages
    WHERE id=p_package_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paket bulunamadı'; END IF;
  IF v_package.status <> 'ready' THEN RAISE EXCEPTION 'Paket yayına hazır değil'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_graph_prerequisite_items
    WHERE package_id=p_package_id AND review_status='approved') THEN
    RAISE EXCEPTION 'Onaylanmış bağlantı yok';
  END IF;

  FOR v_item IN SELECT * FROM public.learning_graph_prerequisite_items
    WHERE package_id=p_package_id AND review_status='approved' ORDER BY created_at FOR UPDATE
  LOOP
    IF EXISTS (
      WITH RECURSIVE reachable(id) AS (
        SELECT v_item.target_node_id
        UNION
        SELECT e.target_node_id FROM public.learning_graph_edges e
        JOIN reachable r ON e.source_node_id=r.id
        WHERE e.edge_type='prerequisite_of' AND e.is_verified
          AND (e.valid_to IS NULL OR e.valid_to > now())
      ) SELECT 1 FROM reachable WHERE id=v_item.source_node_id
    ) THEN
      RAISE EXCEPTION 'Yayın döngü oluşturuyor: % -> %', v_item.source_node_id, v_item.target_node_id;
    END IF;

    INSERT INTO public.learning_graph_edges
      (source_node_id,target_node_id,edge_type,confidence,rationale,source_type,
       is_verified,reviewed_by,curriculum_version_id,valid_from,valid_to)
    VALUES (v_item.source_node_id,v_item.target_node_id,'prerequisite_of',v_item.confidence,
      v_item.rationale,'expert_package',true,p_publisher_id,v_package.curriculum_version_id,now(),NULL)
    ON CONFLICT (source_node_id,target_node_id,edge_type) DO UPDATE SET
      confidence=excluded.confidence,rationale=excluded.rationale,source_type=excluded.source_type,
      is_verified=true,reviewed_by=excluded.reviewed_by,
      curriculum_version_id=excluded.curriculum_version_id,valid_to=NULL,updated_at=now()
    RETURNING id INTO v_edge_id;
    UPDATE public.learning_graph_prerequisite_items SET review_status='published',edge_id=v_edge_id,
      updated_at=now() WHERE id=v_item.id;
    v_count:=v_count+1;
  END LOOP;
  UPDATE public.learning_graph_prerequisite_packages SET status='published',published_by=p_publisher_id,
    published_at=now(),updated_at=now() WHERE id=p_package_id;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.create_learning_graph_prerequisite_package_v1(text,text,text,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.review_learning_graph_prerequisite_item_v1(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.publish_learning_graph_prerequisite_package_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_learning_graph_prerequisite_package_v1(text,text,text,uuid,text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.review_learning_graph_prerequisite_item_v1(uuid,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.publish_learning_graph_prerequisite_package_v1(uuid,uuid) TO service_role;

COMMENT ON TABLE public.learning_graph_prerequisite_packages IS 'Expert-owned, curriculum-versioned prerequisite relation publication batches.';
COMMENT ON TABLE public.learning_graph_prerequisite_items IS 'Row-level review evidence for prerequisite relations; publication is cycle-checked and atomic.';
