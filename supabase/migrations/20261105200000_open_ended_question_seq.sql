-- Bir senaryo (ör. 1. dönem 1. senaryo) birden çok soru içerir; sorular seq sırasıyla öğrenciye art arda gelir.
ALTER TABLE public.open_ended_scenario_examples ADD COLUMN IF NOT EXISTS seq integer NOT NULL DEFAULT 0;
-- Tek PDF'ten yanlışlıkla 1..9 numaralı ayrı senaryolara bölünmüş kayıtlar: hepsi 1. senaryonun soruları olur, sıra eski numaraya göre korunur.
UPDATE public.open_ended_scenario_examples SET seq = scenario_no WHERE source_note = 'PDF: d3f318e84c.pdf' AND seq = 0;
UPDATE public.open_ended_scenario_examples SET scenario_no = 1 WHERE source_note = 'PDF: d3f318e84c.pdf' AND grade_number = 7 AND term = 1;
