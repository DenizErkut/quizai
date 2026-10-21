-- Kurum kayıtlarında konum: ülke (ISO-2), eyalet/il, şehir/ilçe. Yeni kurumlarda üçü de zorunludur
-- (create-institution rotası doğrular); mevcut kurumlar ülke olarak TR işaretlenir, il/ilçe sonradan tamamlanır.
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text;

UPDATE public.institutions SET country = 'TR' WHERE country IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institutions_country_format') THEN
    ALTER TABLE public.institutions ADD CONSTRAINT institutions_country_format CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institutions_location_len') THEN
    ALTER TABLE public.institutions ADD CONSTRAINT institutions_location_len CHECK (char_length(coalesce(state,'')) <= 120 AND char_length(coalesce(city,'')) <= 120);
  END IF;
END $$;
