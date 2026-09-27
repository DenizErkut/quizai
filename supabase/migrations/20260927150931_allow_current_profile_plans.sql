-- Keep the database contract aligned with the plans used by checkout and app access.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check
  CHECK (plan = ANY (ARRAY['free'::text, 'silver'::text, 'premium'::text, 'unlimited'::text]));
