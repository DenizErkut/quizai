-- Consolidate same-role permissive predicates without widening access.
SET lock_timeout = '3s';
DROP POLICY "assignment_completions_select_merged" ON public."assignment_completions";
DROP POLICY "assignment_completions_select_parent" ON public."assignment_completions";
DROP POLICY "Öğrenci kendi tamamlamasını kaydeder" ON public."assignment_completions";
CREATE POLICY "maintenance_select_public" ON public."assignment_completions" AS PERMISSIVE FOR SELECT TO "public" USING ((((student_id = ( SELECT auth.uid() AS uid)) OR (assignment_id IN ( SELECT assignments.id
   FROM assignments
  WHERE (assignments.teacher_id IN ( SELECT teachers.id
           FROM teachers
          WHERE (teachers.user_id = ( SELECT auth.uid() AS uid)))))))) OR ((student_id IN ( SELECT parent_children.child_id
   FROM parent_children
  WHERE (parent_children.parent_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_insert_public" ON public."assignment_completions" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((student_id = ( SELECT auth.uid() AS uid))));
DROP POLICY "Öğrenciler ödevlerini görür" ON public."assignments";
DROP POLICY "Öğretmen ödevleri yönetir" ON public."assignments";
CREATE POLICY "maintenance_select_public" ON public."assignments" AS PERMISSIVE FOR SELECT TO "public" USING (((classroom_id IN ( SELECT classroom_students.classroom_id
   FROM classroom_students
  WHERE (classroom_students.student_id = ( SELECT auth.uid() AS uid))))) OR ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_insert_public" ON public."assignments" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_update_public" ON public."assignments" AS PERMISSIVE FOR UPDATE TO "public" USING (((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK (((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_delete_public" ON public."assignments" AS PERMISSIVE FOR DELETE TO "public" USING (((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid))))));
DROP POLICY "Admin yazabilir" ON public."curriculum";
DROP POLICY "Herkes okuyabilir" ON public."curriculum";
CREATE POLICY "maintenance_select_public" ON public."curriculum" AS PERMISSIVE FOR SELECT TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))) OR (true));
CREATE POLICY "maintenance_insert_public" ON public."curriculum" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_update_public" ON public."curriculum" AS PERMISSIVE FOR UPDATE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_delete_public" ON public."curriculum" AS PERMISSIVE FOR DELETE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
DROP POLICY "error_reports_admin" ON public."error_reports";
DROP POLICY "error_reports_insert" ON public."error_reports";
CREATE POLICY "maintenance_select_public" ON public."error_reports" AS PERMISSIVE FOR SELECT TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_insert_public" ON public."error_reports" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))) OR ((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_update_public" ON public."error_reports" AS PERMISSIVE FOR UPDATE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_delete_public" ON public."error_reports" AS PERMISSIVE FOR DELETE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
DROP POLICY "Admin exam_chunks" ON public."exam_chunks";
DROP POLICY "Service role exam_chunks read" ON public."exam_chunks";
CREATE POLICY "maintenance_select_public" ON public."exam_chunks" AS PERMISSIVE FOR SELECT TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))) OR (true));
CREATE POLICY "maintenance_insert_public" ON public."exam_chunks" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_update_public" ON public."exam_chunks" AS PERMISSIVE FOR UPDATE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_delete_public" ON public."exam_chunks" AS PERMISSIVE FOR DELETE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
DROP POLICY "Admin exam_resources" ON public."exam_resources";
DROP POLICY "Service role exam_resources read" ON public."exam_resources";
CREATE POLICY "maintenance_select_public" ON public."exam_resources" AS PERMISSIVE FOR SELECT TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))) OR (true));
CREATE POLICY "maintenance_insert_public" ON public."exam_resources" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_update_public" ON public."exam_resources" AS PERMISSIVE FOR UPDATE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_delete_public" ON public."exam_resources" AS PERMISSIVE FOR DELETE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
DROP POLICY "grade_notes_select_own" ON public."grade_notes";
DROP POLICY "grade_notes_write_unaffiliated_only" ON public."grade_notes";
CREATE POLICY "maintenance_select_public" ON public."grade_notes" AS PERMISSIVE FOR SELECT TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)) OR (((( SELECT auth.uid() AS uid) = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM institution_users iu
  WHERE ((iu.user_id = grade_notes.user_id) AND (iu.role = 'student'::text))))))));
CREATE POLICY "maintenance_insert_public" ON public."grade_notes" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((((( SELECT auth.uid() AS uid) = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM institution_users iu
  WHERE ((iu.user_id = grade_notes.user_id) AND (iu.role = 'student'::text))))))));
CREATE POLICY "maintenance_update_public" ON public."grade_notes" AS PERMISSIVE FOR UPDATE TO "public" USING ((((( SELECT auth.uid() AS uid) = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM institution_users iu
  WHERE ((iu.user_id = grade_notes.user_id) AND (iu.role = 'student'::text)))))))) WITH CHECK ((((( SELECT auth.uid() AS uid) = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM institution_users iu
  WHERE ((iu.user_id = grade_notes.user_id) AND (iu.role = 'student'::text))))))));
CREATE POLICY "maintenance_delete_public" ON public."grade_notes" AS PERMISSIVE FOR DELETE TO "public" USING ((((( SELECT auth.uid() AS uid) = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM institution_users iu
  WHERE ((iu.user_id = grade_notes.user_id) AND (iu.role = 'student'::text))))))));
DROP POLICY "admin_all_chunks" ON public."meb_chunks";
DROP POLICY "read_all_chunks" ON public."meb_chunks";
CREATE POLICY "maintenance_select_public" ON public."meb_chunks" AS PERMISSIVE FOR SELECT TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))) OR (true));
CREATE POLICY "maintenance_insert_public" ON public."meb_chunks" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_update_public" ON public."meb_chunks" AS PERMISSIVE FOR UPDATE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_delete_public" ON public."meb_chunks" AS PERMISSIVE FOR DELETE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
DROP POLICY "admin_all" ON public."meb_resources";
DROP POLICY "read_all" ON public."meb_resources";
CREATE POLICY "maintenance_select_public" ON public."meb_resources" AS PERMISSIVE FOR SELECT TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))) OR (true));
CREATE POLICY "maintenance_insert_public" ON public."meb_resources" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_update_public" ON public."meb_resources" AS PERMISSIVE FOR UPDATE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true)))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
CREATE POLICY "maintenance_delete_public" ON public."meb_resources" AS PERMISSIVE FOR DELETE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.is_admin = true))))));
DROP POLICY "Kullanıcı kendi bildirimlerini yönetir" ON public."notifications";
DROP POLICY "users_delete_own_notifications" ON public."notifications";
DROP POLICY "users_read_own_notifications" ON public."notifications";
DROP POLICY "users_update_own_notifications" ON public."notifications";
CREATE POLICY "maintenance_select_public" ON public."notifications" AS PERMISSIVE FOR SELECT TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)) OR ((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_insert_public" ON public."notifications" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_update_public" ON public."notifications" AS PERMISSIVE FOR UPDATE TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)) OR ((( SELECT auth.uid() AS uid) = user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id)) OR ((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_delete_public" ON public."notifications" AS PERMISSIVE FOR DELETE TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)) OR ((( SELECT auth.uid() AS uid) = user_id)));
DROP POLICY "open_ended_assignments_student_read" ON public."open_ended_assignments";
DROP POLICY "open_ended_assignments_teacher_all" ON public."open_ended_assignments";
CREATE POLICY "maintenance_select_authenticated" ON public."open_ended_assignments" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((classroom_id IN ( SELECT classroom_students.classroom_id
   FROM classroom_students
  WHERE (classroom_students.student_id = ( SELECT auth.uid() AS uid))))) OR ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_insert_authenticated" ON public."open_ended_assignments" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_update_authenticated" ON public."open_ended_assignments" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid)))))) WITH CHECK (((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_delete_authenticated" ON public."open_ended_assignments" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = ( SELECT auth.uid() AS uid))))));
DROP POLICY "child_see_own" ON public."parent_children";
DROP POLICY "parent_own_children" ON public."parent_children";
CREATE POLICY "maintenance_select_public" ON public."parent_children" AS PERMISSIVE FOR SELECT TO "public" USING (((( SELECT auth.uid() AS uid) = child_id)) OR ((( SELECT auth.uid() AS uid) = parent_id)));
CREATE POLICY "maintenance_insert_public" ON public."parent_children" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((( SELECT auth.uid() AS uid) = parent_id)));
CREATE POLICY "maintenance_update_public" ON public."parent_children" AS PERMISSIVE FOR UPDATE TO "public" USING (((( SELECT auth.uid() AS uid) = parent_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = parent_id)));
CREATE POLICY "maintenance_delete_public" ON public."parent_children" AS PERMISSIVE FOR DELETE TO "public" USING (((( SELECT auth.uid() AS uid) = parent_id)));
DROP POLICY "quiz_sessions_insert" ON public."quiz_sessions";
DROP POLICY "quiz_sessions_select_own" ON public."quiz_sessions";
DROP POLICY "quiz_sessions_select_parent" ON public."quiz_sessions";
DROP POLICY "quiz_sessions_update_own" ON public."quiz_sessions";
CREATE POLICY "maintenance_select_public" ON public."quiz_sessions" AS PERMISSIVE FOR SELECT TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)) OR ((user_id IN ( SELECT parent_children.child_id
   FROM parent_children
  WHERE (parent_children.parent_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_insert_public" ON public."quiz_sessions" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_update_public" ON public."quiz_sessions" AS PERMISSIVE FOR UPDATE TO "public" USING (((( SELECT auth.uid() AS uid) = user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id)));
DROP POLICY "streaks_own" ON public."streaks";
DROP POLICY "streaks_select_parent" ON public."streaks";
CREATE POLICY "maintenance_select_public" ON public."streaks" AS PERMISSIVE FOR SELECT TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)) OR ((user_id IN ( SELECT parent_children.child_id
   FROM parent_children
  WHERE (parent_children.parent_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_insert_public" ON public."streaks" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_update_public" ON public."streaks" AS PERMISSIVE FOR UPDATE TO "public" USING (((( SELECT auth.uid() AS uid) = user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_delete_public" ON public."streaks" AS PERMISSIVE FOR DELETE TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)));
DROP POLICY "weak_topics_own" ON public."weak_topics";
DROP POLICY "weak_topics_select_parent" ON public."weak_topics";
CREATE POLICY "maintenance_select_public" ON public."weak_topics" AS PERMISSIVE FOR SELECT TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)) OR ((user_id IN ( SELECT parent_children.child_id
   FROM parent_children
  WHERE (parent_children.parent_id = ( SELECT auth.uid() AS uid))))));
CREATE POLICY "maintenance_insert_public" ON public."weak_topics" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK (((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_update_public" ON public."weak_topics" AS PERMISSIVE FOR UPDATE TO "public" USING (((( SELECT auth.uid() AS uid) = user_id))) WITH CHECK (((( SELECT auth.uid() AS uid) = user_id)));
CREATE POLICY "maintenance_delete_public" ON public."weak_topics" AS PERMISSIVE FOR DELETE TO "public" USING (((( SELECT auth.uid() AS uid) = user_id)));
