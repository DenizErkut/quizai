-- Öğretmenin senaryodan atadığı açık uçlu ödevlerde şekil (SVG/görsel) ve öğrencinin dolduracağı tablo.
ALTER TABLE public.open_ended_assignments ADD COLUMN IF NOT EXISTS figure_svg text CHECK (figure_svg IS NULL OR char_length(figure_svg) <= 20000);
ALTER TABLE public.open_ended_assignments ADD COLUMN IF NOT EXISTS figure_image text CHECK (figure_image IS NULL OR char_length(figure_image) <= 900000);
ALTER TABLE public.open_ended_assignments ADD COLUMN IF NOT EXISTS answer_table text CHECK (answer_table IS NULL OR char_length(answer_table) <= 3000);
