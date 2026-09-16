
-- Kitap içeriğini (raw_text, chunks) artık veritabanında saklamıyoruz — sadece
-- kullanıcının hangi kitapları yüklediğini/dinlediğini gösteren başlık geçmişi kalıyor.
alter table public.reading_materials drop column if exists raw_text;
alter table public.reading_materials drop column if exists chunks;
