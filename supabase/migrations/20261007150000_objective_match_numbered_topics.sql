-- Coach/ready-topic labels carry suffixes and prefixes the MEB catalog does not
-- ("Geometrik Nicelikler (1)" vs catalog "Geometrik Nicelikler", "1. Ünite: X" vs "X").
-- That left find_learning_objective_candidates_v2 empty and the quiz failed with
-- "Kazanım bulunamadı". Add a LOWEST-priority rank 5 that compares labels with
-- the "(n)" suffix and the "n. Tema/Ünite/Öğrenme Alanı:" prefix stripped. Ranks
-- 1-4 are unchanged, so existing exact matches never change.
CREATE OR REPLACE FUNCTION public.curriculum_match_key(p_label text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT btrim(regexp_replace(regexp_replace(
    public.canonical_curriculum_label(coalesce(p_label, '')),
    '^[0-9]+\.?[[:space:]]*(tema|ünite|ünitesi|öğrenme alanı)[[:space:]]*[:：][[:space:]]*', '', 'i'),
    '[[:space:]]*\([0-9]+\)[[:space:]]*$', ''));
$$;

CREATE OR REPLACE FUNCTION public.find_learning_objective_candidates_v2(
  p_subject text, p_grade text, p_topic text, p_limit integer DEFAULT 24
) RETURNS TABLE (
  id uuid, objective_code text, title text, subject text, grade text, unit text, topic text,
  curriculum_version_id uuid, current_revision_id uuid, match_basis text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH eligible AS (
    SELECT c.*,
      CASE
        WHEN public.canonical_curriculum_label(c.topic)
             = public.canonical_curriculum_label(p_topic) THEN 1
        WHEN position(public.canonical_curriculum_label(p_topic)
                      IN public.canonical_curriculum_label(c.title)) > 0 THEN 2
        WHEN public.canonical_curriculum_label(c.unit)
             = public.canonical_curriculum_label(p_topic) THEN 3
        WHEN public.canonical_curriculum_label(
               regexp_replace(coalesce(c.unit, ''), '^.*[:：][[:space:]]*', '')
             ) = public.canonical_curriculum_label(p_topic) THEN 3
        WHEN EXISTS (
          SELECT 1 FROM public.learning_topic_aliases a
          WHERE a.alias_key = public.learning_dimension_key(p_topic)
            AND a.review_status = 'reviewed'
            AND public.learning_dimension_key(a.canonical_subject)
                = public.learning_dimension_key(c.subject)
            AND public.canonical_curriculum_label(a.canonical_topic)
                = public.canonical_curriculum_label(c.topic)
        ) THEN 4
        WHEN length(public.curriculum_match_key(p_topic)) >= 4
             AND (public.curriculum_match_key(c.topic) = public.curriculum_match_key(p_topic)
               OR public.curriculum_match_key(c.unit) = public.curriculum_match_key(p_topic)) THEN 5
      END AS match_rank
    FROM public.learning_objective_catalog c
    JOIN public.curriculum_versions v
      ON v.id = c.curriculum_version_id AND v.status = 'active'
    WHERE c.verification_status = 'verified'
      AND c.is_active = true
      AND c.lifecycle_status = 'active'
      AND c.current_revision_id IS NOT NULL
      AND public.learning_dimension_key(c.subject) = public.learning_dimension_key(p_subject)
      AND public.canonical_learning_grade(c.grade) = public.canonical_learning_grade(p_grade)
  ), ranked AS (
    SELECT e.*,
      min(e.match_rank) FILTER (WHERE e.match_rank IS NOT NULL) OVER () AS best_rank
    FROM eligible e
  )
  SELECT r.id, r.objective_code, r.title, r.subject, r.grade, r.unit, r.topic,
    r.curriculum_version_id, r.current_revision_id,
    CASE r.match_rank
      WHEN 1 THEN 'topic_exact' WHEN 2 THEN 'title_keyword' WHEN 3 THEN 'unit_exact'
      WHEN 4 THEN 'reviewed_alias' WHEN 5 THEN 'unit_exact'
    END AS match_basis
  FROM ranked r
  WHERE r.match_rank = r.best_rank
  ORDER BY r.objective_code
  LIMIT greatest(1, least(coalesce(p_limit, 24), 50));
$$;

REVOKE ALL ON FUNCTION public.curriculum_match_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curriculum_match_key(text) TO service_role;
REVOKE ALL ON FUNCTION public.find_learning_objective_candidates_v2(text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_learning_objective_candidates_v2(text, text, text, integer) TO service_role;
