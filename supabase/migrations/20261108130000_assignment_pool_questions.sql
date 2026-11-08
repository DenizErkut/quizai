-- Öğretmen ödevlerinde "soruları havuzdan çek": seçilen onaylı soru bankası soruları ödevde dondurulur.
alter table public.assignments add column if not exists pool_questions jsonb;
