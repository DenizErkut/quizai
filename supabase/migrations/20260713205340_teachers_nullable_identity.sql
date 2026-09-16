-- teachers.name/email NOT NULL -> nullable (kimlik TR-PG'ye tasindi).
-- Kolonlari SILMEZ; sadece yeni ogretmen kaydi kodunu unblock eder.
alter table public.teachers alter column name  drop not null;
alter table public.teachers alter column email drop not null;
