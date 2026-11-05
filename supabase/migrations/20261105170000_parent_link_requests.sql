-- Veli → öğrenci bağlama istekleri: veli öğrencinin T.C. Kimlik No'suyla istek açar, öğrenci onaylayınca takip başlar.
CREATE TABLE IF NOT EXISTS public.parent_link_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (parent_id, child_id)
);
CREATE INDEX IF NOT EXISTS idx_parent_link_requests_child ON public.parent_link_requests(child_id, status);
ALTER TABLE public.parent_link_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.parent_link_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.parent_link_requests TO service_role;
