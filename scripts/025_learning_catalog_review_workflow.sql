-- Admin-reviewed topic -> unit publication workflow.

CREATE OR REPLACE FUNCTION public.review_learning_catalog_candidate(
  p_dimension_key text,
  p_action text,
  p_reviewer_id uuid,
  p_unit_node_id uuid DEFAULT NULL,
  p_canonical_topic text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  q public.learning_catalog_review_queue%ROWTYPE;
  u public.learning_graph_nodes%ROWTYPE;
  final_topic text;
  topic_id uuid;
  affected_student uuid;
  grade_count integer;
  observed_grade text;
BEGIN
  IF p_action NOT IN ('map', 'dismiss') THEN
    RAISE EXCEPTION 'action must be map or dismiss';
  END IF;

  SELECT * INTO q FROM public.learning_catalog_review_queue
  WHERE dimension_key = p_dimension_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catalog candidate not found'; END IF;
  IF q.status <> 'pending' THEN RAISE EXCEPTION 'Catalog candidate is already %', q.status; END IF;

  IF p_action = 'dismiss' THEN
    UPDATE public.learning_catalog_review_queue SET
      status = 'dismissed', reviewed_by = p_reviewer_id,
      reviewed_at = now(), updated_at = now()
    WHERE dimension_key = p_dimension_key;
    RETURN NULL;
  END IF;

  final_topic := regexp_replace(btrim(coalesce(p_canonical_topic, q.observed_label)), '\s+', ' ', 'g');
  IF char_length(final_topic) < 2 OR char_length(final_topic) > 180 THEN
    RAISE EXCEPTION 'Canonical topic length must be between 2 and 180';
  END IF;
  IF p_unit_node_id IS NULL THEN RAISE EXCEPTION 'Unit node is required'; END IF;

  SELECT * INTO u FROM public.learning_graph_nodes
  WHERE id = p_unit_node_id AND node_type = 'unit' AND is_active = true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active unit node not found'; END IF;

  grade_count := jsonb_array_length(coalesce(q.sample_grades, '[]'::jsonb));
  IF grade_count <> 1 THEN
    RAISE EXCEPTION 'Candidate spans % grades and must be split before mapping', grade_count;
  END IF;
  observed_grade := q.sample_grades->>0;
  IF public.canonical_learning_grade(observed_grade) <> public.canonical_learning_grade(u.grade) THEN
    RAISE EXCEPTION 'Candidate grade (%) does not match unit grade (%)', observed_grade, u.grade;
  END IF;

  INSERT INTO public.learning_topic_aliases
    (alias_key, canonical_topic, canonical_subject, review_status, notes)
  VALUES (public.learning_dimension_key(q.observed_label), final_topic, u.subject,
    'reviewed', 'Admin catalog review: ' || p_dimension_key)
  ON CONFLICT (alias_key) DO UPDATE SET
    canonical_topic = EXCLUDED.canonical_topic,
    canonical_subject = EXCLUDED.canonical_subject,
    review_status = 'reviewed', notes = EXCLUDED.notes, updated_at = now();

  INSERT INTO public.learning_graph_nodes
    (node_key, node_type, label, subject, grade, level, source_type, metadata, is_active)
  VALUES (
    'topic:catalog:' || md5(concat_ws('|', u.level, public.canonical_learning_grade(u.grade),
      lower(u.subject), public.learning_dimension_key(final_topic))),
    'topic', final_topic, u.subject, u.grade, u.level, 'admin_review',
    jsonb_build_object('catalog_version', 'v1', 'verification_status', 'verified'), true
  )
  ON CONFLICT (node_key) DO UPDATE SET
    label = EXCLUDED.label, subject = EXCLUDED.subject, grade = EXCLUDED.grade,
    level = EXCLUDED.level, metadata = EXCLUDED.metadata,
    is_active = true, updated_at = now()
  RETURNING id INTO topic_id;

  INSERT INTO public.learning_graph_edges
    (source_node_id, target_node_id, edge_type, confidence, rationale,
     source_type, is_verified, reviewed_by)
  VALUES (topic_id, u.id, 'part_of', 1.000,
    'Admin tarafından doğrulanan konu-ünite eşleştirmesi',
    'admin_review', true, p_reviewer_id)
  ON CONFLICT (source_node_id, target_node_id, edge_type) DO UPDATE SET
    confidence = 1.000, rationale = EXCLUDED.rationale,
    source_type = EXCLUDED.source_type, is_verified = true,
    reviewed_by = EXCLUDED.reviewed_by, updated_at = now();

  INSERT INTO public.learning_content_node_mappings
    (source_type, source_id, node_id, mapping_method, confidence,
     is_verified, reviewed_by, metadata)
  VALUES ('quiz_topic', p_dimension_key, topic_id, 'manual', 1.000, true,
    p_reviewer_id, jsonb_build_object('original_label', q.observed_label))
  ON CONFLICT (source_type, source_id, node_id) DO UPDATE SET
    confidence = 1.000, is_verified = true, reviewed_by = EXCLUDED.reviewed_by,
    metadata = EXCLUDED.metadata, updated_at = now();

  FOR affected_student IN
    SELECT DISTINCT student_id FROM public.learning_events
    WHERE public.learning_dimension_key(subject) = public.learning_dimension_key(q.observed_subject)
      AND public.learning_dimension_key(topic) = public.learning_dimension_key(q.observed_label)
      AND public.canonical_learning_grade(grade) = public.canonical_learning_grade(observed_grade)
  LOOP
    UPDATE public.learning_events SET
      subject = u.subject,
      topic = final_topic,
      metadata = coalesce(metadata, '{}'::jsonb)
        || jsonb_build_object('catalog_mapping_key', p_dimension_key,
          'catalog_topic_node_id', topic_id)
    WHERE student_id = affected_student
      AND public.learning_dimension_key(subject) = public.learning_dimension_key(q.observed_subject)
      AND public.learning_dimension_key(topic) = public.learning_dimension_key(q.observed_label)
      AND public.canonical_learning_grade(grade) = public.canonical_learning_grade(observed_grade);

    PERFORM public.rebuild_student_mastery_v1(affected_student);
    PERFORM public.refresh_student_learning_profile(affected_student);
    PERFORM public.refresh_student_recommendations(affected_student);
  END LOOP;

  UPDATE public.learning_catalog_review_queue SET
    status = 'mapped', mapped_node_id = topic_id,
    reviewed_by = p_reviewer_id, reviewed_at = now(), updated_at = now()
  WHERE dimension_key = p_dimension_key;

  RETURN topic_id;
END;
$$;

REVOKE ALL ON FUNCTION public.review_learning_catalog_candidate(text, text, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_learning_catalog_candidate(text, text, uuid, uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.review_learning_catalog_candidate(text, text, uuid, uuid, text) IS
  'Atomically maps a single-grade observed topic to a verified unit, or dismisses it; service-role only.';
