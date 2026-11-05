-- Açık Uçlu senaryo örneklerine ve üretilen oturumlara görsel (şekil) desteği: güvenli, sadeleştirilmiş SVG metni.
ALTER TABLE public.open_ended_scenario_examples ADD COLUMN IF NOT EXISTS figure_svg text CHECK (figure_svg IS NULL OR char_length(figure_svg) <= 20000);
ALTER TABLE public.open_ended_sessions ADD COLUMN IF NOT EXISTS figure_svg text CHECK (figure_svg IS NULL OR char_length(figure_svg) <= 20000);
