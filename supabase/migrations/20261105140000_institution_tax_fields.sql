-- Kurumsal müşteri tanımı: vergi dairesi, vergi numarası ve şirket ünvanı.
-- Mevcut kurumlar bozulmasın diye sütunlar boş olabilir; yeni kurum oluştururken uygulama zorunlu tutar.
-- Vergi numarası kurum girişinde tanımlayıcı olarak kullanılır → benzersiz (10 hane).
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS tax_office text,
  ADD COLUMN IF NOT EXISTS tax_number text,
  ADD COLUMN IF NOT EXISTS company_title text;
ALTER TABLE public.institutions DROP CONSTRAINT IF EXISTS institutions_tax_number_format;
ALTER TABLE public.institutions ADD CONSTRAINT institutions_tax_number_format CHECK (tax_number IS NULL OR tax_number ~ '^[0-9]{10}$');
CREATE UNIQUE INDEX IF NOT EXISTS institutions_tax_number_key ON public.institutions (tax_number) WHERE tax_number IS NOT NULL;
