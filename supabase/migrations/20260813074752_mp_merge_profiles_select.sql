DROP POLICY profiles_select ON public.profiles;
DROP POLICY profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_merged ON public.profiles
  FOR SELECT
  USING (
    ((select auth.uid()) = id)
    OR
    ((select auth.role()) = 'authenticated'::text)
  );
