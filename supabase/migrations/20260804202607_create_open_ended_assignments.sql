-- Ogretmenin bir sinifa atadigi, sabit (herkes icin ayni) senaryo+soru+rubrik
-- iceren acik uclu soru odevi. open_ended_sessions (ogrencinin TEK SEFERLIK
-- kendi kendine pratik denemesi) tablosundan FARKLI - bu bir "sablon/odev",
-- birden fazla ogrenci ayni soruyu cevaplar.
CREATE TABLE IF NOT EXISTS public.open_ended_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  classroom_id uuid NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  title text NOT NULL,
  grade text,
  subject text,
  topic text,
  scenario text NOT NULL,
  question text NOT NULL,
  rubric jsonb NOT NULL,
  created_via text NOT NULL DEFAULT 'manual', -- 'ai' | 'manual'
  due_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_open_ended_assignments_classroom_id ON public.open_ended_assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_open_ended_assignments_teacher_id ON public.open_ended_assignments(teacher_id);

ALTER TABLE public.open_ended_assignments ENABLE ROW LEVEL SECURITY;

-- Ogretmen sadece kendi olusturduklarini yonetir
CREATE POLICY open_ended_assignments_teacher_all ON public.open_ended_assignments
  FOR ALL TO authenticated
  USING (teacher_id IN (SELECT id FROM public.teachers WHERE user_id = (select auth.uid())))
  WITH CHECK (teacher_id IN (SELECT id FROM public.teachers WHERE user_id = (select auth.uid())));

-- Ogrenci, KENDI sinifina atanmis odevleri okuyabilir (rubrik dahil -
-- rubrik zaten puanlama sirasinda gorunmez sekilde kullanilir, mevcut
-- generate-open-ended akisinda da rubrik client'a gonderiliyor, ayni
-- yaklasim korunuyor)
CREATE POLICY open_ended_assignments_student_read ON public.open_ended_assignments
  FOR SELECT TO authenticated
  USING (classroom_id IN (SELECT classroom_id FROM public.classroom_students WHERE student_id = (select auth.uid())));

-- open_ended_sessions'a, hangi odeve ait oldugunu baglayan opsiyonel kolon
-- (NULL = ogrencinin kendi baslattigi serbest pratik, mevcut davranis)
ALTER TABLE public.open_ended_sessions
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES public.open_ended_assignments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_open_ended_sessions_assignment_id ON public.open_ended_sessions(assignment_id);
