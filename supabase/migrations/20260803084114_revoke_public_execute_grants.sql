-- Postgres varsayilani: fonksiyonlar olusturulunca EXECUTE otomatik
-- olarak PUBLIC'e verilir. Onceki REVOKE FROM anon, authenticated bu
-- yuzden yetersizdi - PUBLIC uzerinden erisim hala acikti. Simdi PUBLIC'ten
-- de kaldiriyoruz (postgres/service_role zaten ayrica sahip, etkilenmiyor).
REVOKE EXECUTE ON FUNCTION public.increment_test_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_premium_expiry() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_referral_bonus() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_assignment() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_monthly_tests() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
-- is_institution_admin: PUBLIC'ten kaldir ama authenticated'a olan AYRI
-- (RLS'in ihtiyac duydugu) grant'i koru.
REVOKE EXECUTE ON FUNCTION public.is_institution_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_institution_admin(uuid) TO authenticated;
