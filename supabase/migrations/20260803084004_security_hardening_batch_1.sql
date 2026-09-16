-- 1) search_path sabitleme — davranis DEGISMEZ, sadece hijyen/guvenlik
ALTER FUNCTION public.handle_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.generate_referral_code() SET search_path = public;
ALTER FUNCTION public.handle_referral_bonus() SET search_path = public;
ALTER FUNCTION public.reset_monthly_tests() SET search_path = public;
ALTER FUNCTION public.increment_test_count(uuid) SET search_path = public;
ALTER FUNCTION public.check_premium_expiry() SET search_path = public;
ALTER FUNCTION public.notify_assignment() SET search_path = public;
ALTER FUNCTION public.search_meb_chunks(vector, text, text, text, integer) SET search_path = public;
ALTER FUNCTION public.get_dashboard_stats(uuid) SET search_path = public;
ALTER FUNCTION public.rls_auto_enable() SET search_path = public;
ALTER FUNCTION public.is_institution_admin(uuid) SET search_path = public;

-- 2) anon/authenticated icin gereksiz RPC erisimini kapat (onceden
--    dogrulandi: app kodunda .rpc() ile hic cagrilmiyor ve hicbir RLS
--    politikasinda kullanilmiyor)
REVOKE EXECUTE ON FUNCTION public.increment_test_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_premium_expiry() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_referral_bonus() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_assignment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_tests() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
-- is_institution_admin: institution_admin_view RLS politikasinda
-- authenticated baglaminda calistigi icin SADECE anon'dan kaldirildi.
REVOKE EXECUTE ON FUNCTION public.is_institution_admin(uuid) FROM anon;

-- 3) "Herkese acik yaz" politikalarini daralt
DROP POLICY IF EXISTS ab_events_insert_anon ON public.ab_events;
DROP POLICY IF EXISTS ab_events_insert_auth ON public.ab_events;
CREATE POLICY ab_events_insert_own ON public.ab_events
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS streaks_all ON public.streaks;
CREATE POLICY streaks_select_own ON public.streaks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY streaks_insert_own ON public.streaks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY streaks_update_own ON public.streaks
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS daily_challenges_insert_all ON public.daily_challenges;

-- 4) coaching_leads / grade_imports: niyeti belgeleyen acik bir
--    service_role politikasi (davranis degismiyor, sadece belgeleniyor)
CREATE POLICY coaching_leads_service_role ON public.coaching_leads
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY grade_imports_service_role ON public.grade_imports
  FOR ALL TO service_role USING (true) WITH CHECK (true);
