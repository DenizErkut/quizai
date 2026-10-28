-- "Yazılıya Hazırlanıyorum": yönetici, sınıf/ders/dönem/kaçıncı yazılı için hazır açık uçlu soru setleri yükler;
-- öğrenci bu soruları sırayla çözer, cevaplar mevcut Açık Uçlu (AUS) rubrik puanlamasıyla değerlendirilir.
-- Yapay zeka bu akışta soru ÜRETMEZ; yalnızca yüklenen soruları ve cevap anahtarından türetilen rubriği kullanır.
-- Tablolara yalnızca sunucu (service_role) erişir; öğrenci verisi API üzerinden süzülerek verilir.

CREATE TABLE IF NOT EXISTS public.written_exam_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 200),
  grade_number integer NOT NULL CHECK (grade_number BETWEEN 1 AND 12),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 2 AND 120),
  term integer NOT NULL CHECK (term IN (1, 2)),
  exam_number integer NOT NULL CHECK (exam_number BETWEEN 1 AND 4),
  country text NOT NULL DEFAULT 'TR' CHECK (country ~ '^[A-Z]{2}$'),
  state text,
  city text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  total_points integer NOT NULL DEFAULT 0 CHECK (total_points >= 0),
  source_note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS written_exam_sets_slot_idx
  ON public.written_exam_sets (country, coalesce(state, ''), coalesce(city, ''), grade_number, lower(subject), term, exam_number);
CREATE INDEX IF NOT EXISTS written_exam_sets_lookup_idx ON public.written_exam_sets (status, grade_number, country);

CREATE TABLE IF NOT EXISTS public.written_exam_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.written_exam_sets(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 1),
  title text NOT NULL DEFAULT '',
  objective_code text,
  scenario text NOT NULL DEFAULT '',
  question text NOT NULL CHECK (char_length(btrim(question)) >= 3),
  max_points integer NOT NULL CHECK (max_points BETWEEN 1 AND 100),
  rubric jsonb NOT NULL CHECK (jsonb_typeof(rubric) = 'array' AND jsonb_array_length(rubric) BETWEEN 1 AND 20),
  answer_key text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (set_id, position)
);

CREATE TABLE IF NOT EXISTS public.written_exam_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  set_id uuid NOT NULL REFERENCES public.written_exam_sets(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  total_earned integer,
  total_possible integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS written_exam_attempts_user_idx ON public.written_exam_attempts (user_id, set_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.written_exam_attempt_items (
  attempt_id uuid NOT NULL REFERENCES public.written_exam_attempts(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.written_exam_questions(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.open_ended_sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id)
);

ALTER TABLE public.written_exam_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.written_exam_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.written_exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.written_exam_attempt_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.written_exam_sets, public.written_exam_questions, public.written_exam_attempts, public.written_exam_attempt_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.written_exam_sets, public.written_exam_questions, public.written_exam_attempts, public.written_exam_attempt_items TO service_role;
