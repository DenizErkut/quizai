-- Recommendation Engine v2: context-aware, explainable prioritisation.
CREATE TABLE IF NOT EXISTS public.student_recommendation_priority_context (
  student_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  time_budget_minutes integer CHECK (time_budget_minutes IS NULL OR time_budget_minutes BETWEEN 5 AND 240),
  next_exam_at timestamptz,
  institution_topic_priorities jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(institution_topic_priorities) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_recommendation_priority_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_recommendation_priority_context FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.student_recommendation_priority_context TO service_role;

CREATE OR REPLACE FUNCTION public.get_student_recommendations_priority_v2(
  p_student_id uuid,
  p_time_budget_minutes integer DEFAULT NULL,
  p_next_exam_at timestamptz DEFAULT NULL
) RETURNS TABLE (
  id uuid, subject text, topic text, action_type text, reason text, status text,
  priority_score numeric, estimated_minutes integer, priority_breakdown jsonb,
  deferred_until timestamptz, accepted_at timestamptz
) LANGUAGE sql SECURITY INVOKER SET search_path = public, pg_temp AS $$
WITH context AS (
  SELECT coalesce(p_time_budget_minutes, c.time_budget_minutes, 30) AS budget,
    coalesce(p_next_exam_at, c.next_exam_at) AS exam_at,
    coalesce(c.institution_topic_priorities, '{}'::jsonb) AS topic_priorities
  FROM (SELECT 1) seed
  LEFT JOIN public.student_recommendation_priority_context c ON c.student_id = p_student_id
), candidates AS (
  SELECT r.*, greatest(5, least(60, coalesce((r.evidence->>'estimatedMinutes')::integer, 10))) AS minutes,
    CASE WHEN a.due_date IS NULL THEN 0
      WHEN a.due_date < now() THEN 20
      WHEN a.due_date <= now() + interval '2 days' THEN 16
      WHEN a.due_date <= now() + interval '7 days' THEN 8 ELSE 0 END AS assignment_boost,
    CASE WHEN x.exam_at IS NULL THEN 0
      WHEN x.exam_at <= now() THEN 0
      WHEN x.exam_at <= now() + interval '3 days' THEN 18
      WHEN x.exam_at <= now() + interval '14 days' THEN 10 ELSE 0 END AS exam_boost,
    CASE WHEN coalesce(x.topic_priorities ->> lower(r.topic), '') IN ('high','urgent') THEN 15 ELSE 0 END AS institution_boost,
    x.budget
  FROM public.student_recommendations r
  CROSS JOIN context x
  LEFT JOIN LATERAL (
    SELECT a.due_date FROM public.assignments a
    JOIN public.classroom_students cs ON cs.classroom_id = a.classroom_id
    WHERE cs.student_id = p_student_id AND lower(a.topic) = lower(r.topic)
    ORDER BY a.due_date NULLS LAST LIMIT 1
  ) a ON true
  WHERE r.student_id = p_student_id AND r.status IN ('active','accepted','deferred')
    AND (r.status <> 'deferred' OR r.deferred_until > now())
    AND r.valid_until > now()
), scored AS (
  SELECT c.*, least(100, greatest(0,
    c.priority_score + c.assignment_boost + c.exam_boost + c.institution_boost
    + CASE WHEN c.minutes <= c.budget THEN 6 ELSE -12 END
  )) AS context_score,
  row_number() OVER (PARTITION BY lower(c.subject), c.action_type ORDER BY c.priority_score DESC, c.generated_at DESC) AS diversity_rank
  FROM candidates c
)
SELECT id, subject, topic, action_type, reason, status,
  round(greatest(0, context_score - greatest(0, diversity_rank - 1) * 6), 2),
  minutes::integer,
  jsonb_build_object(
    'baseScore', priority_score, 'assignmentBoost', assignment_boost,
    'examBoost', exam_boost, 'institutionBoost', institution_boost,
    'timeBudgetMinutes', budget, 'estimatedMinutes', minutes,
    'diversityPenalty', greatest(0, diversity_rank - 1) * 6,
    'rankVersion', 'recommendation-priority-v2'
  ), deferred_until, accepted_at
FROM scored
ORDER BY context_score - greatest(0, diversity_rank - 1) * 6 DESC, generated_at DESC
LIMIT 10;
$$;

REVOKE ALL ON FUNCTION public.get_student_recommendations_priority_v2(uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_recommendations_priority_v2(uuid, integer, timestamptz) TO service_role;

COMMENT ON TABLE public.student_recommendation_priority_context IS
  'Optional, service-managed time/exam/institution context used by Recommendation Engine v2 ranking.';
