-- Açık Uçlu Sorular: yönetici sınıf/ders/dönem/senaryo numarası (1, 2, 3, ...) için örnek senaryo+soru+rubrik yükler;
-- öğrenci bir senaryo kartını seçince yapay zeka bu örneklere benzer YENİ bir senaryo üretir (örnekleri kopyalamaz).
-- Tabloya yalnızca sunucu (service_role) erişir.
CREATE TABLE IF NOT EXISTS public.open_ended_scenario_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_number integer NOT NULL CHECK (grade_number BETWEEN 1 AND 12),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 2 AND 120),
  term integer NOT NULL CHECK (term IN (1, 2)),
  scenario_no integer NOT NULL CHECK (scenario_no BETWEEN 1 AND 99),
  title text NOT NULL DEFAULT '',
  scenario text NOT NULL CHECK (char_length(btrim(scenario)) >= 10),
  question text NOT NULL CHECK (char_length(btrim(question)) >= 5),
  rubric jsonb NOT NULL CHECK (jsonb_typeof(rubric) = 'array' AND jsonb_array_length(rubric) BETWEEN 1 AND 10),
  country text NOT NULL DEFAULT 'TR' CHECK (country ~ '^[A-Z]{2}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  source_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS open_ended_scenario_examples_slot_idx
  ON public.open_ended_scenario_examples (status, grade_number, country, term, scenario_no);

ALTER TABLE public.open_ended_scenario_examples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.open_ended_scenario_examples FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.open_ended_scenario_examples TO service_role;
