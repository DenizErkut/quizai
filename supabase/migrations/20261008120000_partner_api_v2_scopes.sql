-- Partner (CRM/ERP) API v2: richer export scopes, write scopes, external-id links.
-- Identified (non-pseudonymous) scopes require an explicit data-processing acknowledgement by the
-- institution admin, recorded on the credential.
ALTER TABLE public.partner_integrations DROP CONSTRAINT IF EXISTS partner_integrations_v1_scopes;
ALTER TABLE public.partner_integrations DROP CONSTRAINT IF EXISTS partner_integrations_scopes;
ALTER TABLE public.partner_integrations
  ADD CONSTRAINT partner_integrations_scopes CHECK (
    scopes <@ ARRAY[
      'institution:read', 'students:read:pseudonymous',
      'institution:read:identity', 'students:read:identified', 'classrooms:read',
      'results:read', 'mastery:read', 'grades:read', 'grades:write', 'students:link'
    ]::text[]
  );

ALTER TABLE public.partner_integrations
  ADD COLUMN IF NOT EXISTS pii_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS pii_acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- CRM/ERP record ids mapped to Pratium students, per external system.
CREATE TABLE IF NOT EXISTS public.partner_external_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  system text NOT NULL CHECK (system ~ '^[a-z0-9_.-]{2,40}$'),
  external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 120),
  created_by_integration uuid REFERENCES public.partner_integrations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, system, external_id),
  UNIQUE (institution_id, system, student_id)
);
CREATE INDEX IF NOT EXISTS partner_external_links_student_idx ON public.partner_external_links (student_id);
CREATE INDEX IF NOT EXISTS partner_external_links_integration_idx ON public.partner_external_links (created_by_integration);

ALTER TABLE public.partner_external_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_external_links FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_external_links TO service_role;

-- Export helpers: tenant-scoped joins in SQL (no giant IN lists). Callable by service_role only.
CREATE OR REPLACE FUNCTION public.partner_export_quizzes(p_institution uuid, p_since timestamptz, p_limit int, p_offset int)
RETURNS SETOF jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', q.id, 'user_id', q.user_id, 'topic', q.topic, 'grade', q.grade, 'question_count', q.question_count,
    'score', q.score, 'pct', q.pct, 'partial_pct', q.partial_pct, 'question_type', q.question_type, 'is_daily', q.is_daily, 'created_at', q.created_at)
  FROM public.quiz_sessions q
  JOIN public.institution_users iu ON iu.user_id = q.user_id AND iu.institution_id = p_institution AND iu.role = 'student'
  WHERE q.completed AND (p_since IS NULL OR q.created_at > p_since)
  ORDER BY q.created_at, q.id LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.partner_export_open_ended(p_institution uuid, p_since timestamptz, p_limit int, p_offset int)
RETURNS SETOF jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', o.id, 'user_id', o.user_id, 'assignment_id', o.assignment_id, 'subject', o.subject, 'topic', o.topic, 'grade', o.grade,
    'total_earned', o.total_earned, 'total_possible', o.total_possible, 'source', o.source, 'teacher_adjusted', o.teacher_adjusted, 'graded_at', o.graded_at)
  FROM public.open_ended_sessions o
  JOIN public.institution_users iu ON iu.user_id = o.user_id AND iu.institution_id = p_institution AND iu.role = 'student'
  WHERE o.graded_at IS NOT NULL AND (p_since IS NULL OR o.graded_at > p_since)
  ORDER BY o.graded_at, o.id LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.partner_export_mastery(p_institution uuid, p_since timestamptz, p_limit int, p_offset int)
RETURNS SETOF jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', w.id, 'user_id', w.user_id, 'subject', w.subject, 'topic', w.topic, 'wrong_count', w.wrong_count,
    'total_count', w.total_count, 'last_seen_at', w.last_seen_at)
  FROM public.weak_topics w
  JOIN public.institution_users iu ON iu.user_id = w.user_id AND iu.institution_id = p_institution AND iu.role = 'student'
  WHERE (p_since IS NULL OR w.last_seen_at > p_since)
  ORDER BY w.last_seen_at, w.id LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.partner_export_grades(p_institution uuid, p_since timestamptz, p_limit int, p_offset int)
RETURNS SETOF jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', g.id, 'user_id', g.student_id, 'subject', g.subject, 'value_text', g.value_text, 'value_numeric', g.value_numeric,
    'import_label', i.label, 'created_at', g.created_at)
  FROM public.student_grades g
  JOIN public.grade_imports i ON i.id = g.import_id
  JOIN public.institution_users iu ON iu.user_id = g.student_id AND iu.institution_id = p_institution AND iu.role = 'student'
  WHERE (p_since IS NULL OR g.created_at > p_since)
  ORDER BY g.created_at, g.id LIMIT p_limit OFFSET p_offset;
$$;

CREATE OR REPLACE FUNCTION public.partner_export_classrooms(p_institution uuid, p_since timestamptz, p_limit int, p_offset int)
RETURNS SETOF jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', c.id, 'name', c.name, 'grade', c.grade, 'subject', c.subject, 'created_at', c.created_at,
    'teacher_name', t.name, 'teacher_school', t.school,
    'student_user_ids', (SELECT coalesce(jsonb_agg(cs.student_id ORDER BY cs.student_id), '[]'::jsonb)
       FROM public.classroom_students cs
       JOIN public.institution_users iu ON iu.user_id = cs.student_id AND iu.institution_id = p_institution AND iu.role = 'student'
       WHERE cs.classroom_id = c.id))
  FROM public.classrooms c
  LEFT JOIN public.teachers t ON t.id = c.teacher_id
  WHERE EXISTS (SELECT 1 FROM public.classroom_students cs
       JOIN public.institution_users iu ON iu.user_id = cs.student_id AND iu.institution_id = p_institution AND iu.role = 'student'
       WHERE cs.classroom_id = c.id)
    AND (p_since IS NULL OR c.created_at > p_since)
  ORDER BY c.created_at, c.id LIMIT p_limit OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.partner_export_quizzes(uuid, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_export_open_ended(uuid, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_export_mastery(uuid, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_export_grades(uuid, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_export_classrooms(uuid, timestamptz, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.partner_export_quizzes(uuid, timestamptz, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_export_open_ended(uuid, timestamptz, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_export_mastery(uuid, timestamptz, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_export_grades(uuid, timestamptz, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_export_classrooms(uuid, timestamptz, int, int) TO service_role;
