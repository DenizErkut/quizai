-- 006_fix_institution_admin_recursion.sql — Supabase'de MCP ile uygulandı, 21.07.2026
--
-- KÖK NEDEN (önceden var olan bir bug, bu oturumda tanıtılmadı):
-- institution_users tablosundaki 'institution_admin_view' SELECT politikası
-- kendi tablosuna (institution_users) bakan bir alt sorgu içeriyordu:
--
--   EXISTS (SELECT 1 FROM institution_users iu
--           WHERE iu.institution_id = institution_users.institution_id
--             AND iu.user_id = auth.uid() AND iu.role = 'admin')
--
-- Postgres bu SELECT'i değerlendirirken alt sorguya da AYNI RLS politikalarını
-- uygulamak zorunda kalıyor — bu da aynı politikayı tekrar tetikliyor ve
-- sonsuz döngüye giriyor: "infinite recursion detected in policy for
-- relation institution_users".
--
-- ETKİSİ: Herhangi bir authenticated (service-role olmayan) kullanıcı
-- institution_users'ı SELECT etmeye çalıştığında istek 500 ile patlıyordu.
--Örnek: bir öğrenci /profile/edit sayfasını her açtığında, kurum üyeliği
-- durumunu client-side sorguyla çekmeye çalışıyor, bu recursion'a çarpıp
-- sessizce boş dönüyordu — kullanıcı gerçekte kayıtlı olsa bile arayüzde
-- 'kayıtlı değilsin' görünüyordu (join API'si service-role kullandığı için
-- kendisi etkilenmiyordu, sadece OKUMA tarafı kırıktı).
--
-- ÇÖZÜM: Alt sorguyu SECURITY DEFINER bir fonksiyona taşımak — bu fonksiyon
-- kendi RLS'ini tetiklemeden (fonksiyon sahibinin yetkisiyle) çalışır,
-- döngüyü kırar. Bu, Supabase'de bu tür self-referencing RLS durumları için
-- standart çözümdür.

CREATE OR REPLACE FUNCTION is_institution_admin(check_institution_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM institution_users
    WHERE institution_id = check_institution_id
      AND user_id = auth.uid()
      AND role = 'admin'
  );
$$;

DROP POLICY institution_admin_view ON institution_users;

CREATE POLICY institution_admin_view ON institution_users
  FOR SELECT USING (is_institution_admin(institution_id));

-- Doğrulama: diğer tablolarda aynı öz-referanslı örüntü var mı taranmış,
-- bulunmamıştır — bu tek noktaydı.
