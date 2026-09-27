-- Match short student topic labels to the leaf of the same-grade/unit label.
-- Example: "Kesirler" -> "Sayılar ve Nicelikler (2): Kesirler".
-- Subject, grade, active version and verified lifecycle filters remain mandatory.
CREATE OR REPLACE FUNCTION public.find_learning_objective_candidates_v2(
  p_subject text,
  p_grade text,
  p_topic text,
  p_limit integer DEFAULT 24
) RETURNS TABLE (
  id uuid,
  objective_code text,
  title text,
  subject text,
  grade text,
  unit text,
  topic text,
  curriculum_version_id uuid,
  current_revision_id uuid,
  match_basis text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH eligible AS (
    SELECT c.*,
      CASE
        WHEN public.canonical_curriculum_label(c.topic)
             = public.canonical_curriculum_label(p_topic)
          THEN 1
        WHEN public.canonical_curriculum_label(c.unit)
             = public.canonical_curriculum_label(p_topic)
          THEN 2
        WHEN public.canonical_curriculum_label(
               regexp_replace(coalesce(c.unit, ''), '^.*[:：][[:space:]]*', '')
             ) = public.canonical_curriculum_label(p_topic)
          THEN 2
        WHEN EXISTS (
          SELECT 1 FROM public.learning_topic_aliases a
          WHERE a.alias_key = public.learning_dimension_key(p_topic)
            AND a.review_status = 'reviewed'
            AND public.learning_dimension_key(a.canonical_subject)
                = public.learning_dimension_key(c.subject)
            AND public.canonical_curriculum_label(a.canonical_topic)
                = public.canonical_curriculum_label(c.topic)
        ) THEN 3
      END AS match_rank
    FROM public.learning_objective_catalog c
    JOIN public.curriculum_versions v
      ON v.id = c.curriculum_version_id AND v.status = 'active'
    WHERE c.verification_status = 'verified'
      AND c.is_active = true
      AND c.lifecycle_status = 'active'
      AND c.current_revision_id IS NOT NULL
      AND public.learning_dimension_key(c.subject)
          = public.learning_dimension_key(p_subject)
      AND public.canonical_learning_grade(c.grade)
          = public.canonical_learning_grade(p_grade)
  ), ranked AS (
    SELECT e.*,
      min(e.match_rank) FILTER (WHERE e.match_rank IS NOT NULL) OVER () AS best_rank
    FROM eligible e
  )
  SELECT r.id, r.objective_code, r.title, r.subject, r.grade, r.unit, r.topic,
    r.curriculum_version_id, r.current_revision_id,
    CASE r.match_rank
      WHEN 1 THEN 'topic_exact'
      WHEN 2 THEN 'unit_exact'
      WHEN 3 THEN 'reviewed_alias'
    END AS match_basis
  FROM ranked r
  WHERE r.match_rank = r.best_rank
  ORDER BY r.objective_code
  LIMIT greatest(1, least(coalesce(p_limit, 24), 50));
$$;

REVOKE ALL ON FUNCTION public.find_learning_objective_candidates_v2(text, text, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_learning_objective_candidates_v2(text, text, text, integer)
  TO service_role;

COMMENT ON FUNCTION public.find_learning_objective_candidates_v2(text, text, text, integer) IS
  'Returns active verified objectives using exact topic, exact unit, deterministic unit-leaf, or reviewed alias matching within the requested subject and grade.';
