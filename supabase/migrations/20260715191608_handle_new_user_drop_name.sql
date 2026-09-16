-- handle_new_user artik profiles.name YAZMIYOR ve grade default'unu
-- ('ortaokul 6. sinif') tamamen kaldiriyor. Yeni satir grade=NULL ile olusur;
-- grade kayit akisinda (register/page) veya /profile onboarding'inde set edilir.
-- SECURITY DEFINER korunur. name kolonu SILINMEZ (bu ayri, en son adim).
-- Kod tarafi: register/page.tsx signUp artik metadata'ya name gondermiyor
-- (ayni deploy).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  -- Yalnizca platform satirini olustur; kimlik (ad) TR-PG'de.
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;
