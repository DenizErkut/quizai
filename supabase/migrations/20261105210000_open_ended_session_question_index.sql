-- Senaryo serisinde oturumun hangi soruya ait olduğu (0 tabanlı): karttaki "N soru çözüldü" sayısı için.
ALTER TABLE public.open_ended_sessions ADD COLUMN IF NOT EXISTS question_index integer;
