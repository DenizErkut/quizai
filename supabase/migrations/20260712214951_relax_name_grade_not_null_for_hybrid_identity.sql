
-- Hibrit kimlik mimarisi ile 'name' artık Supabase'e yazılmıyor (TR-PG'de yaşıyor).
-- 'grade' da sadece öğrenciler için anlamlı, öğretmen/veli kayıtlarında hiç gönderilmiyor.
-- İkisini de NOT NULL'dan çıkarıyoruz — mevcut veriler etkilenmez, sadece yeni
-- kayıtların bu alanları boş bırakabilmesine izin veriyoruz.
alter table public.profiles alter column name drop not null;
alter table public.profiles alter column grade drop not null;
