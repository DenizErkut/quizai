-- TR-PG (identity.pratium.com VPS, pratium_identity veritabanı) — MANUEL UYGULANDI
-- Tarih: 20.07.2026, VPS'te doğrudan psql ile çalıştırıldı (bu repo'daki
-- kodla otomatik senkron DEĞİL — TR-PG için ayrı bir migration sistemi yok,
-- bu dosya sadece kayıt/referans amaçlı).
--
-- Sebep: app/api/admin/create-institution/route.ts artık kurum yöneticisi
-- hesapları için TR-PG'de createIdentity() çağırıyor (role: 'institution_admin'),
-- ama identities.role kolonunun CHECK constraint'i sadece
-- 'student' | 'teacher' | 'parent' kabul ediyordu — bu route canlıda
-- "new row ... violates check constraint identities_role_check" hatasıyla
-- patlıyordu (bkz. 2 gerçek kurum admin hesabının identity kaydı hiç
-- oluşmamıştı: İsabet Halkalı, Mine Aktel Özel Öğretim Kursu).
--
-- Uygulanan komut:
ALTER TABLE identities DROP CONSTRAINT identities_role_check;
ALTER TABLE identities ADD CONSTRAINT identities_role_check
  CHECK (role = ANY (ARRAY['student'::text, 'teacher'::text, 'parent'::text, 'institution_admin'::text]));

-- Doğrulama:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'identities'::regclass AND contype = 'c';
--   identities_role_check | CHECK ((role = ANY (ARRAY['student'::text, 'teacher'::text, 'parent'::text, 'institution_admin'::text])))
