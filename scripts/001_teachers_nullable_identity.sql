-- 001_teachers_nullable_identity.sql
-- ACİL / HEMEN UYGULANIR — diğer adımlardan bağımsız, tek başına güvenli.
--
-- Neden: Öğretmen kaydı artık teachers tablosuna name/email YAZMIYOR (kimlik
-- TR-PG'de). Ancak teachers.name ve teachers.email şu an NOT NULL. Yeni kod
-- deploy edilir edilmez, bu kolonlar olmadan yapılan INSERT'ler NOT NULL
-- ihlaliyle patlar. Bu migration kısıtı gevşetir (kolonları SİLMEZ — veri korunur).
--
-- Geri alınabilir: değerler backfill edildikten sonra NOT NULL geri eklenebilir.
-- Bu, destructive drop (supabase-profiles-migration.sql) ile İLGİSİZDİR ve
-- ondan önce/bağımsız uygulanmalıdır.

alter table public.teachers alter column name  drop not null;
alter table public.teachers alter column email drop not null;
