-- AUS (açık uçlu soru) havuzu: açık uçlu bölümünde üretilen/kaydedilen sorular tek havuzda toplanır; incelemeci (yönetici ya da onaylı öğretmen) onaylar/reddeder.
CREATE TABLE IF NOT EXISTS public.open_ended_question_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('student_ai', 'teacher_assignment')),
  source_ref uuid,
  grade text,
  subject text,
  topic text,
  scenario text NOT NULL,
  question text NOT NULL,
  rubric jsonb NOT NULL DEFAULT '[]'::jsonb,
  figure_svg text,
  answer_table text,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_role text CHECK (reviewed_by_role IS NULL OR reviewed_by_role IN ('admin', 'teacher')),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_aus_pool_status ON public.open_ended_question_pool(status, created_at DESC);
ALTER TABLE public.open_ended_question_pool ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.open_ended_question_pool FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.open_ended_question_pool TO service_role;

-- Mevcut kayıtlardan ilk doldurma (yinelenen soru metinleri tek kayıt olur).
INSERT INTO public.open_ended_question_pool (source, source_ref, grade, subject, topic, scenario, question, rubric, figure_svg, answer_table, fingerprint)
SELECT DISTINCT ON (fp) 'student_ai', id, grade, subject, topic, scenario, question, rubric, figure_svg, answer_table, fp
FROM (
  SELECT s.*, md5(lower(regexp_replace(coalesce(s.scenario, '') || '|' || coalesce(s.question, ''), '\s+', ' ', 'g'))) AS fp
  FROM public.open_ended_sessions s
  WHERE s.assignment_id IS NULL AND coalesce(s.scenario, '') <> '' AND coalesce(s.question, '') <> '' AND s.rubric IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.written_exam_attempt_items w WHERE w.session_id = s.id)
) t ORDER BY fp, created_at
ON CONFLICT (fingerprint) DO NOTHING;

INSERT INTO public.open_ended_question_pool (source, source_ref, grade, subject, topic, scenario, question, rubric, figure_svg, answer_table, fingerprint)
SELECT DISTINCT ON (fp) 'teacher_assignment', id, grade, subject, topic, scenario, question, rubric, figure_svg, answer_table, fp
FROM (
  SELECT a.*, md5(lower(regexp_replace(coalesce(a.scenario, '') || '|' || coalesce(a.question, ''), '\s+', ' ', 'g'))) AS fp
  FROM public.open_ended_assignments a
  WHERE coalesce(a.scenario, '') <> '' AND coalesce(a.question, '') <> '' AND a.rubric IS NOT NULL
) t ORDER BY fp, created_at
ON CONFLICT (fingerprint) DO NOTHING;
