SET lock_timeout = '3s';
-- Authenticated own reports and existing admin predicate retain their exact scopes.
ALTER POLICY maintenance_select_public ON public.error_reports
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id=(SELECT auth.uid()) AND profiles.is_admin=true)
  OR ((SELECT pg_has_role(current_user, 'authenticated', 'USAGE')) AND user_id=(SELECT auth.uid()))
);
DROP POLICY error_reports_select_own ON public.error_reports;
-- Existing public SELECT is already true; this authenticated policy adds no access.
DROP POLICY exam_chunks_read ON public.exam_chunks;
-- Existing PUBLIC policies enforce the same owner for each operation.
DROP POLICY "Users manage own SR cards" ON public.spaced_repetition_cards;
DROP POLICY streaks_insert_own ON public.streaks;
DROP POLICY streaks_select_own ON public.streaks;
DROP POLICY streaks_update_own ON public.streaks;
