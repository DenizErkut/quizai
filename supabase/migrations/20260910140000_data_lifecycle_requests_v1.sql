-- KVKK/data-lifecycle request register. No automatic deletion is performed by this migration.
CREATE TABLE IF NOT EXISTS public.data_lifecycle_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subject_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  request_kind text NOT NULL CHECK (request_kind IN ('access','correction','deletion','restriction')),
  scope text NOT NULL DEFAULT 'all_student_data',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','in_progress','completed','rejected')),
  verification_note text,
  processed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_lifecycle_requests_status_idx ON public.data_lifecycle_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS data_lifecycle_requests_subject_idx ON public.data_lifecycle_requests(subject_user_id, created_at DESC);
ALTER TABLE public.data_lifecycle_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.data_lifecycle_requests FROM anon, authenticated;
GRANT ALL ON public.data_lifecycle_requests TO service_role;
COMMENT ON TABLE public.data_lifecycle_requests IS 'Controlled KVKK lifecycle register; execution requires verified operator workflow.';
