DROP POLICY "Öğrenci kendi tamamlamasını görür" ON public.assignment_completions;
DROP POLICY "Öğretmen tamamlanmaları görür" ON public.assignment_completions;
CREATE POLICY assignment_completions_select_merged ON public.assignment_completions
  FOR SELECT
  USING (
    (student_id = (select auth.uid()))
    OR
    (assignment_id IN (SELECT assignments.id FROM assignments WHERE assignments.teacher_id IN (SELECT teachers.id FROM teachers WHERE teachers.user_id = (select auth.uid()))))
  );
