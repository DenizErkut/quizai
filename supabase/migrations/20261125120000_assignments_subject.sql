-- Öğretmen ödevinde ders seçimi: ödev artık dersini kendisi taşır (sınıfın tek "subject" alanına bağlı kalmaz).
alter table public.assignments add column if not exists subject text;
