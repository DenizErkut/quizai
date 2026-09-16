-- avatars public bucket oldugu icin dosya URL erisimi zaten bu politikaya
-- ihtiyac duymuyor (Supabase public bucket'larda /storage/v1/object/public/
-- yolunu RLS'ten bagimsiz servis eder). Bu politika sadece gereksiz yere
-- TUM bucket'in listelenebilmesine izin veriyordu.
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
