-- 1) Normal quiz odevlerinde de bildirim TETIKLEYICISI hic YOKTU
--    (notify_assignment() fonksiyonu vardi ama hicbir tabloya bagli
--    trigger'i yoktu - kod tarafinda da cagrilmiyordu, tamamen olu kod).
--    Simdi hem bunu hem yeni acik uclu odev tablosunu bagliyoruz.
DROP TRIGGER IF EXISTS trg_notify_assignment ON public.assignments;
CREATE TRIGGER trg_notify_assignment
  AFTER INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_assignment();

-- 2) Acik uclu odev icin ayni mantikta yeni bildirim fonksiyonu + trigger
CREATE OR REPLACE FUNCTION public.notify_open_ended_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  student_row RECORD;
BEGIN
  FOR student_row IN
    SELECT student_id FROM classroom_students WHERE classroom_id = NEW.classroom_id
  LOOP
    INSERT INTO notifications (user_id, type, title, body, data)
    VALUES (
      student_row.student_id,
      'assignment',
      '💬 Yeni açık uçlu ödev: ' || NEW.title,
      COALESCE(NEW.subject, 'Bir ders') || ' konusunda açık uçlu soru ödevi eklendi.',
      jsonb_build_object('href', '/acik-uclu', 'open_ended_assignment_id', NEW.id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_open_ended_assignment ON public.open_ended_assignments;
CREATE TRIGGER trg_notify_open_ended_assignment
  AFTER INSERT ON public.open_ended_assignments
  FOR EACH ROW EXECUTE FUNCTION public.notify_open_ended_assignment();

-- 3) OpenAI/MEB uygunluk dogrulamasindan gectigini belgeleyen kolon
ALTER TABLE public.open_ended_assignments ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
