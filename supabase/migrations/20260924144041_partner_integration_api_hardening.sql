-- token_hash already has a unique index; do not retain a redundant partial index.
-- Applied on the production project as migration 20260924144041.
DROP INDEX IF EXISTS public.partner_integrations_active_lookup;

-- Removing the credential issuer should safely revoke credentials instead of blocking
-- user deletion. Child audit and rate-limit rows cascade with the integration.
ALTER TABLE public.partner_integrations
  DROP CONSTRAINT IF EXISTS partner_integrations_created_by_fkey;
ALTER TABLE public.partner_integrations
  ADD CONSTRAINT partner_integrations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

