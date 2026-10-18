-- Konum alanları: profil (öğrenci kaydı/profil) ve müfredat yükleme tabloları.
-- country = ISO 3166-1 alpha-2 kodu; state/city = seçilen/yazılan ad.
-- Posta kodu ve açık adres kimlik verisidir: profiles'a DEĞİL, TR-PG identities'e yazılır
-- (bkz. docs/TR-PG-konum-alanlari.sql).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text;

-- Mevcut müfredat ve sürümleri MEB (Türkiye) kapsamıdır; state/city boş = ulusal.
ALTER TABLE public.curriculum_versions
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'TR',
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.learning_objective_import_batches
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'TR',
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.curriculum
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'TR',
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','curriculum_versions','learning_objective_import_batches','curriculum'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_country_format') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (country IS NULL OR country ~ ''^[A-Z]{2}$'')', t, t || '_country_format');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_location_len') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (char_length(coalesce(state,'''')) <= 120 AND char_length(coalesce(city,'''')) <= 120)', t, t || '_location_len');
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS curriculum_versions_location_idx ON public.curriculum_versions (country, state, city);
CREATE INDEX IF NOT EXISTS curriculum_location_idx ON public.curriculum (country, state, city);
