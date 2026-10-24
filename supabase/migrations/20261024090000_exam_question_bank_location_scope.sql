-- Sınav üretimi soru havuzu (exam_question_bank) konuma göre ayrılır: ülke zorunlu (mevcut veri TR), eyalet/şehir opsiyonel.
ALTER TABLE public.exam_question_bank
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'TR',
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.exam_question_bank DROP CONSTRAINT IF EXISTS exam_question_bank_country_format;
ALTER TABLE public.exam_question_bank ADD CONSTRAINT exam_question_bank_country_format CHECK (country ~ '^[A-Z]{2}$');
CREATE INDEX IF NOT EXISTS exam_question_bank_country_idx ON public.exam_question_bank (country, exam_type, section_id);
