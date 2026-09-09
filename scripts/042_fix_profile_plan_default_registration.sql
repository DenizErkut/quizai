-- Fix new-user registration failure.
-- The live default ('none') violated profiles_plan_check ('free'|'premium').

ALTER TABLE public.profiles
  ALTER COLUMN plan SET DEFAULT 'free'::text;

COMMENT ON COLUMN public.profiles.plan IS
  'Active application plan. New accounts start on free; paid upgrades set premium.';
