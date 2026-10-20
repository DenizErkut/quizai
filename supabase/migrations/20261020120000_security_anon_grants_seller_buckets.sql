-- Güvenlik raporu (20 Ekim 2026) — D4, D6, D8 (üretimde uygulandı). D5 ayrı dosyada.

-- D4: anon rolünün tablolardaki varsayılan DML yetkileri kaldırıldı; yalnızca oturumsuz okunması gereken
-- 4 tabloya SELECT geri verildi (RLS politikaları bu tablolarda anon okumasını zaten sınırlıyor).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p')
             AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
               OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE'))
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;
GRANT SELECT ON public.ab_tests, public.challenges, public.topic_prerequisites, public.topic_suggestions TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;

-- D6: satıcı atfı kayıtta bir kez atanır; kullanıcı sonradan değiştiremez/silemez.
CREATE OR REPLACE FUNCTION public.guard_profile_seller_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND OLD.seller_id IS NOT NULL AND NEW.seller_id IS DISTINCT FROM OLD.seller_id THEN
    RAISE EXCEPTION 'Seller attribution cannot be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_profile_seller_v1() FROM PUBLIC, anon, authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'profiles_guard_seller') THEN
    CREATE TRIGGER profiles_guard_seller BEFORE UPDATE OF seller_id ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.guard_profile_seller_v1();
  END IF;
END $$;

-- D8: kova sınırları (avatar yalnızca görsel ve ≤2 MB; öğretmen belgeleri ≤15 MB).
UPDATE storage.buckets SET allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp'], file_size_limit = 2097152 WHERE id = 'avatars';
UPDATE storage.buckets SET file_size_limit = 15728640 WHERE id = 'teacher-documents';
