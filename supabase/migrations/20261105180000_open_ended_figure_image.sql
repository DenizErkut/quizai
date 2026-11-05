-- Açık Uçlu senaryo örneklerine PDF'ten otomatik kırpılan şekil görseli (PNG/JPEG data URL).
ALTER TABLE public.open_ended_scenario_examples ADD COLUMN IF NOT EXISTS figure_image text CHECK (figure_image IS NULL OR char_length(figure_image) <= 900000);
ALTER TABLE public.open_ended_sessions ADD COLUMN IF NOT EXISTS figure_image text CHECK (figure_image IS NULL OR char_length(figure_image) <= 900000);
