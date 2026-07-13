-- 002_handle_new_user_drop_name.sql
-- ⚠️ SADECE kod deploy'u ile AYNI ANDA uygulanır.
--
-- Bağımlı kod değişikliği: app/(auth)/register/page.tsx — signUp artık
-- options.data.name GÖNDERMİYOR. Bu iki değişiklik birlikte gitmeli:
--   * Trigger'ı önce değiştirip kodu geç deploy edersen: eski kod hâlâ
--     metadata.name gönderir ama yeni trigger yok sayar → sorun yok.
--   * Kodu önce deploy edip trigger'ı geç değiştirirsen: yeni kod name
--     göndermez, eski trigger coalesce ile profiles.name='Kullanıcı' yazar
--     (gerçek isim değil). İsim zaten TR-PG'de olduğundan uygulama etkilenmez,
--     ama tutarlılık için ikisini birlikte deploy et.
--
-- Bu sürüm: handle_new_user artık profiles.name YAZMIYOR ve grade default'unu
-- ('ortaokul 6. sınıf') kaldırıyor. profiles.grade nullable olduğundan yeni
-- satır grade=NULL ile oluşur; grade zaten kayıt akışında (register/page
-- öğrenci upsert'i) veya /profile onboarding'inde set ediliyor.
--
-- NOT: name kolonu HÂLÂ mevcut (bu migration onu SİLMEZ). Silme işlemi ayrı
-- ve en son adımdaki supabase-profiles-migration.sql ile yapılacak.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Yalnızca platform satırını oluştur; kimlik (ad) TR-PG'de.
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
