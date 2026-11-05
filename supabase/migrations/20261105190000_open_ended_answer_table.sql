-- Açık Uçlu senaryolarda öğrencinin doldurduğu tablo: satır başına bir satır, hücreler "|" ile; boş hücre = doldurulacak.
ALTER TABLE public.open_ended_scenario_examples ADD COLUMN IF NOT EXISTS answer_table text CHECK (answer_table IS NULL OR char_length(answer_table) <= 3000);
ALTER TABLE public.open_ended_sessions ADD COLUMN IF NOT EXISTS answer_table text CHECK (answer_table IS NULL OR char_length(answer_table) <= 3000);
