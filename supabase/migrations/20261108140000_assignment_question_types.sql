-- Test ödevinde çoklu soru tipi seçimi (karma): seçilen tipler listesi.
alter table public.assignments add column if not exists question_types jsonb;
