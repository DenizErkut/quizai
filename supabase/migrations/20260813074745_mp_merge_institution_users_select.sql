DROP POLICY "Users can view own institution membership" ON public.institution_users;
DROP POLICY institution_admin_view ON public.institution_users;
DROP POLICY institution_users_own ON public.institution_users;
CREATE POLICY institution_users_select_merged ON public.institution_users
  FOR SELECT
  USING (
    (user_id = (select auth.uid()))
    OR
    is_institution_admin(institution_id)
  );
