-- Güvenlik raporu D5 (20 Ekim 2026): kurum tablosu artık tüm giriş yapmış kullanıcılara açık değil ve öğrenci
-- kendini doğrudan kuruma ekleyemez. Kod→ad doğrulaması /api/institution/lookup, katılım /api/institution/join
-- üzerinden yapılır (sunucu kodu doğrular). Uygulama kodu dağıtıldıktan SONRA uygulanır.
ALTER POLICY authenticated_read_institutions ON public.institutions TO authenticated
  USING (
    private.is_institution_admin(id)
    OR EXISTS (SELECT 1 FROM public.institution_users iu WHERE iu.institution_id = institutions.id AND iu.user_id = (SELECT auth.uid()))
  );
ALTER POLICY "Students can join institutions" ON public.institution_users TO authenticated WITH CHECK (false);
