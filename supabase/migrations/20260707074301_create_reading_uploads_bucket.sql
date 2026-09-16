
insert into storage.buckets (id, name, public, file_size_limit)
values ('reading-uploads', 'reading-uploads', false, 52428800)
on conflict (id) do nothing;

-- Kullanıcı sadece kendi klasörüne (user_id/...) yükleyebilir
create policy "reading_uploads_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'reading-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "reading_uploads_read_own" on storage.objects
for select to authenticated
using (bucket_id = 'reading-uploads' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "reading_uploads_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'reading-uploads' and (storage.foldername(name))[1] = auth.uid()::text);
