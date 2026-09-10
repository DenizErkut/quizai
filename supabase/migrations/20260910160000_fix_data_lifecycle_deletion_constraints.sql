-- Preserve audit UUIDs without preventing deletion of the referenced auth user.
ALTER TABLE public.data_lifecycle_requests
  DROP CONSTRAINT IF EXISTS data_lifecycle_requests_requested_by_fkey,
  DROP CONSTRAINT IF EXISTS data_lifecycle_requests_subject_user_id_fkey,
  DROP CONSTRAINT IF EXISTS data_lifecycle_requests_processed_by_fkey;

COMMENT ON COLUMN public.data_lifecycle_requests.subject_user_id IS
  'Immutable audit identifier; intentionally not an auth.users FK so approved account deletion can complete.';
