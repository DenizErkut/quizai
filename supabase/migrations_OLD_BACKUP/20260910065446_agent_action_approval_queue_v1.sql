CREATE TABLE IF NOT EXISTS public.agent_action_approval_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  classroom_id uuid REFERENCES public.classrooms(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  policy_version text NOT NULL,
  proposed_action text NOT NULL CHECK (proposed_action IN ('assign_practice','send_message','adjust_plan')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  rationale text NOT NULL CHECK (char_length(rationale) BETWEEN 1 AND 1000),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_action_approval_teacher_status_idx ON public.agent_action_approval_queue(teacher_id,status,created_at DESC);
ALTER TABLE public.agent_action_approval_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_action_approval_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.agent_action_approval_queue TO service_role;
COMMENT ON TABLE public.agent_action_approval_queue IS 'Service-only agent proposals; no action is executed before an owning teacher approves it.';
