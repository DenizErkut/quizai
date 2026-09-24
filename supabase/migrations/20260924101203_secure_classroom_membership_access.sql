-- Close the public, unconditional classroom reads that expose invite codes and
-- student/class associations. Student-facing reads are served through routes
-- that first authenticate the user and verify their membership.

DROP POLICY IF EXISTS cs_select_all ON public.classroom_students;
DROP POLICY IF EXISTS classrooms_student_select ON public.classrooms;
DROP POLICY IF EXISTS cs_insert_own ON public.classroom_students;
DROP POLICY IF EXISTS cs_student_insert ON public.classroom_students;
DROP POLICY IF EXISTS cs_student_own ON public.classroom_students;
DROP POLICY IF EXISTS cs_teacher_all ON public.classroom_students;

ALTER POLICY classrooms_teacher_all ON public.classrooms TO authenticated;

-- Use one SELECT policy so the student's own membership and teacher roster
-- access do not overlap as separate permissive policies.
CREATE POLICY classroom_students_select_own_or_teacher
ON public.classroom_students
FOR SELECT TO authenticated
USING (
  student_id = (select auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.classrooms c
    JOIN public.teachers t ON t.id = c.teacher_id
    WHERE c.id = classroom_students.classroom_id
      AND t.user_id = (select auth.uid())
  )
);

-- Teachers keep the existing class-management powers, limited to their own
-- classrooms. Students can no longer self-enroll by submitting a classroom UUID.
CREATE POLICY classroom_students_teacher_insert
ON public.classroom_students
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.classrooms c
    JOIN public.teachers t ON t.id = c.teacher_id
    WHERE c.id = classroom_students.classroom_id
      AND t.user_id = (select auth.uid())
  )
);

CREATE POLICY classroom_students_teacher_update
ON public.classroom_students
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.classrooms c
    JOIN public.teachers t ON t.id = c.teacher_id
    WHERE c.id = classroom_students.classroom_id
      AND t.user_id = (select auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.classrooms c
    JOIN public.teachers t ON t.id = c.teacher_id
    WHERE c.id = classroom_students.classroom_id
      AND t.user_id = (select auth.uid())
  )
);

CREATE POLICY classroom_students_delete_own_or_teacher
ON public.classroom_students
FOR DELETE TO authenticated
USING (
  student_id = (select auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.classrooms c
    JOIN public.teachers t ON t.id = c.teacher_id
    WHERE c.id = classroom_students.classroom_id
      AND t.user_id = (select auth.uid())
  )
);

-- The app no longer needs direct anonymous table access for these records.
-- Authenticated teacher workflows retain their existing table privileges.
REVOKE ALL ON TABLE public.classroom_students FROM anon;
REVOKE ALL ON TABLE public.classrooms FROM anon;
