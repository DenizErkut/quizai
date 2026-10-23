-- Kaynak yuklemeleri ve soru havuzu ulke/eyalet/sehir kapsami kazanir (ulke zorunlu, eyalet/sehir bos = ulke geneli).
-- Bugune kadar yuklenen ve uretilen tum veri Turkiye (TR) olarak isaretlenir.
ALTER TABLE public.meb_resources ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'TR';
ALTER TABLE public.meb_resources ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.meb_resources ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.exam_resources ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'TR';
ALTER TABLE public.exam_resources ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.exam_resources ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'TR';
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE public.question_bank ADD COLUMN IF NOT EXISTS city text;
CREATE INDEX IF NOT EXISTS meb_resources_country_idx ON public.meb_resources (country);
CREATE INDEX IF NOT EXISTS exam_resources_country_idx ON public.exam_resources (country);
CREATE INDEX IF NOT EXISTS question_bank_country_idx ON public.question_bank (country);
