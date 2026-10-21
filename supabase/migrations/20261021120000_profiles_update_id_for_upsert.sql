-- Istemci `profiles` yazimlari supabase-js upsert kullaniyor; PostgREST upsert'i
-- ON CONFLICT DO UPDATE SET id = EXCLUDED.id ... uretir ve `id` sutununda UPDATE yetkisi ister.
-- 20261004112943 sutun duzeyi yetki listesinde `id` yoktu: her upsert "permission denied" (403)
-- veriyordu ve profil duzenleme (sinif, okul, cinsiyet, dil) sessizce kaydedilmiyordu.
-- RLS politikasi (profiles_update_own: auth.uid() = id hem USING hem WITH CHECK) satirin id'sinin
-- degistirilmesini engelledigi icin bu yetki baska satira erisim saglamaz.
GRANT UPDATE (id) ON public.profiles TO authenticated;
