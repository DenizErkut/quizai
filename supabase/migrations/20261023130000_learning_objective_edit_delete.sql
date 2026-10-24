-- Admin "Kazanım Kaynakları" ekranından kazanım düzenleme ve silme.
-- Düzenleme: başlık/kaynak referansı yerinde düzeltilir; aktif revizyon ve grafik düğümü güncellenir, denetim kaydı düşülür.
-- Silme: yalnızca hiçbir yerde kullanılmayan kazanım silinir; kullanılıyorsa engellenir (emekli etme önerilir).
-- Silinen kazanımın tam kopyası (revizyonlar ve denetim kayıtlarıyla) learning_objective_deletion_log tablosunda saklanır.
ALTER TABLE public.learning_objective_lifecycle_audit DROP CONSTRAINT IF EXISTS learning_objective_lifecycle_audit_action_check;
ALTER TABLE public.learning_objective_lifecycle_audit ADD CONSTRAINT learning_objective_lifecycle_audit_action_check
  CHECK (action IN ('create', 'draft_revision', 'publish_revision', 'supersede', 'retire', 'reactivate', 'edit'));

CREATE TABLE IF NOT EXISTS public.learning_objective_deletion_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  objective_id uuid NOT NULL,
  objective_code text NOT NULL,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 3),
  snapshot jsonb NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.learning_objective_deletion_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_objective_deletion_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_objective_deletion_log TO service_role;

CREATE OR REPLACE FUNCTION public.learning_objective_usage_v1(p_objective_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE c public.learning_objective_catalog%ROWTYPE; r jsonb;
BEGIN
  SELECT * INTO c FROM public.learning_objective_catalog WHERE id = p_objective_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
  r := jsonb_build_object(
    'learning_events', (SELECT count(*) FROM public.learning_events WHERE learning_objective_id = c.id),
    'student_mastery', (SELECT count(*) FROM public.student_mastery WHERE learning_objective_id = c.id),
    'learning_gain_measurements', (SELECT count(*) FROM public.learning_gain_measurements WHERE learning_objective_id = c.id),
    'learning_transfer_checks', (SELECT count(*) FROM public.learning_transfer_checks WHERE learning_objective_id = c.id),
    'verified_learning_cycles', (SELECT count(*) FROM public.verified_learning_cycles WHERE learning_objective_id = c.id),
    'education_eval_benchmark_items', (SELECT count(*) FROM public.education_eval_benchmark_items WHERE objective_id = c.id),
    'education_eval_ai_question_items', (SELECT count(*) FROM public.education_eval_ai_question_items WHERE objective_id = c.id),
    'question_bank', (SELECT count(*) FROM public.question_bank WHERE question->>'learningObjectiveCode' = c.objective_code),
    'exam_booklets', (SELECT count(*) FROM public.exam_resources WHERE upper(c.objective_code) = ANY (SELECT upper(x) FROM unnest(coalesce(learning_objective_codes, '{}'::text[])) AS x)),
    'replaced_by_references', (SELECT count(*) FROM public.learning_objective_catalog WHERE replaced_by_objective_id = c.id),
    'graph_prerequisites', (SELECT count(*) FROM public.learning_graph_prerequisite_items WHERE c.graph_node_id IS NOT NULL AND (source_node_id = c.graph_node_id OR target_node_id = c.graph_node_id)));
  RETURN r || jsonb_build_object('total', (SELECT coalesce(sum(v::int), 0) FROM jsonb_each_text(r) AS t(k, v)));
END; $$;

CREATE OR REPLACE FUNCTION public.edit_learning_objective_v1(
  p_objective_id uuid, p_actor_id uuid, p_title text, p_source_reference text, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE c public.learning_objective_catalog%ROWTYPE; v_title text; v_source text;
BEGIN
  IF p_actor_id IS NULL OR char_length(btrim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Actor and change reason are required'; END IF;
  v_title := regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  IF char_length(v_title) < 3 OR char_length(v_title) > 1000 THEN RAISE EXCEPTION 'Title must be 3-1000 characters'; END IF;
  SELECT * INTO c FROM public.learning_objective_catalog WHERE id = p_objective_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
  v_source := coalesce(nullif(btrim(p_source_reference), ''), c.source_reference);
  UPDATE public.learning_objective_catalog SET title = v_title, source_reference = v_source, updated_at = now() WHERE id = c.id;
  IF c.current_revision_id IS NOT NULL THEN
    UPDATE public.learning_objective_revisions SET title = v_title, source_reference = v_source,
      content_hash = md5(concat_ws('|', objective_code, v_title, level, grade, subject, coalesce(unit, ''), coalesce(topic, ''), topic_node_id::text))
    WHERE id = c.current_revision_id;
  END IF;
  IF c.graph_node_id IS NOT NULL THEN
    UPDATE public.learning_graph_nodes SET label = v_title, updated_at = now() WHERE id = c.graph_node_id;
  END IF;
  INSERT INTO public.learning_objective_lifecycle_audit (objective_id, action, actor_id, reason, before_state, after_state)
  VALUES (c.id, 'edit', p_actor_id, btrim(p_reason),
    jsonb_build_object('title', c.title, 'source_reference', c.source_reference),
    jsonb_build_object('title', v_title, 'source_reference', v_source));
  RETURN jsonb_build_object('objective_id', c.id, 'title', v_title, 'source_reference', v_source);
END; $$;

CREATE OR REPLACE FUNCTION public.delete_learning_objective_v1(p_objective_id uuid, p_actor_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE c public.learning_objective_catalog%ROWTYPE; v_usage jsonb;
BEGIN
  IF p_actor_id IS NULL OR char_length(btrim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Actor and deletion reason are required'; END IF;
  SELECT * INTO c FROM public.learning_objective_catalog WHERE id = p_objective_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Objective not found'; END IF;
  v_usage := public.learning_objective_usage_v1(c.id);
  IF (v_usage->>'total')::int > 0 THEN RAISE EXCEPTION 'objective_in_use: %', v_usage::text; END IF;
  INSERT INTO public.learning_objective_deletion_log (objective_id, objective_code, deleted_by, reason, snapshot)
  VALUES (c.id, c.objective_code, p_actor_id, btrim(p_reason), jsonb_build_object(
    'objective', to_jsonb(c),
    'revisions', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.learning_objective_revisions r WHERE r.objective_id = c.id), '[]'::jsonb),
    'audit', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.learning_objective_lifecycle_audit a WHERE a.objective_id = c.id), '[]'::jsonb)));
  UPDATE public.learning_objective_catalog SET current_revision_id = NULL WHERE id = c.id;
  DELETE FROM public.learning_objective_revisions WHERE objective_id = c.id;
  DELETE FROM public.learning_objective_lifecycle_audit WHERE objective_id = c.id;
  DELETE FROM public.learning_objective_catalog WHERE id = c.id;
  IF c.graph_node_id IS NOT NULL THEN DELETE FROM public.learning_graph_nodes WHERE id = c.graph_node_id; END IF;
  RETURN jsonb_build_object('objective_id', c.id, 'objective_code', c.objective_code);
END; $$;
