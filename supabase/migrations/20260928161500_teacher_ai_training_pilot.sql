-- Teacher AI literacy pilot progress and non-accredited completion badges.
-- API routes verify approved teacher status before using the service role.

CREATE TABLE IF NOT EXISTS public.teacher_ai_training_module_completions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_version text NOT NULL DEFAULT 'teacher-ai-literacy-pilot-v1',
  module_id text NOT NULL CHECK (module_id IN ('verify', 'curriculum', 'pedagogy', 'safety')),
  passed boolean NOT NULL DEFAULT false,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 4),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  attested_at timestamptz NOT NULL,
  passed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_version, module_id),
  CHECK (NOT passed OR passed_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.teacher_ai_training_certificates (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_version text NOT NULL,
  certificate_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, course_version)
);

ALTER TABLE public.teacher_ai_training_module_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_ai_training_certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.teacher_ai_training_module_completions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.teacher_ai_training_certificates FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.teacher_ai_training_module_completions TO service_role;
GRANT ALL ON public.teacher_ai_training_certificates TO service_role;

COMMENT ON TABLE public.teacher_ai_training_module_completions IS
  'Versioned teacher AI literacy pilot quiz scores, protected behind approved-teacher API checks.';
COMMENT ON TABLE public.teacher_ai_training_certificates IS
  'Internal pilot completion badges; not an accredited professional certificate.';
