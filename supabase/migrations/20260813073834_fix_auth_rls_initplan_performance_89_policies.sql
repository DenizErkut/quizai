-- auth_rls_initplan performans uyarısı düzeltmesi (89 politika)
-- Mantık DEĞİŞMİYOR -- sadece auth.uid()/auth.role() çağrıları
-- (select auth.uid()) ile sarmalanıyor, böylece Postgres sorgu planlayıcısı
-- bunu satır başına değil, sorgu başına bir kez hesaplıyor.
ALTER POLICY ab_assignments_own ON public.ab_assignments USING ((user_id = (select auth.uid())));
ALTER POLICY "Öğrenci kendi tamamlamasını görür" ON public.assignment_completions USING ((student_id = (select auth.uid())));
ALTER POLICY "Öğretmen tamamlanmaları görür" ON public.assignment_completions USING ((assignment_id IN ( SELECT assignments.id
   FROM assignments
  WHERE (assignments.teacher_id IN ( SELECT teachers.id
           FROM teachers
          WHERE (teachers.user_id = (select auth.uid())))))));
ALTER POLICY "Öğrenciler ödevlerini görür" ON public.assignments USING ((classroom_id IN ( SELECT classroom_students.classroom_id
   FROM classroom_students
  WHERE (classroom_students.student_id = (select auth.uid())))));
ALTER POLICY "Öğretmen ödevleri yönetir" ON public.assignments USING ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = (select auth.uid())))));
ALTER POLICY badges_own ON public.badges USING (((select auth.uid()) = user_id));
ALTER POLICY "Kullanici attempt gunceller" ON public.challenge_attempts USING (((select auth.uid()) = user_id));
ALTER POLICY class_members_delete_own ON public.class_members USING (((select auth.uid()) = user_id));
ALTER POLICY cs_student_own ON public.classroom_students USING ((student_id = (select auth.uid())));
ALTER POLICY cs_teacher_all ON public.classroom_students USING ((EXISTS ( SELECT 1
   FROM (teachers t
     JOIN classrooms c ON ((c.teacher_id = t.id)))
  WHERE ((c.id = classroom_students.classroom_id) AND (t.user_id = (select auth.uid()))))));
ALTER POLICY classrooms_teacher_all ON public.classrooms USING ((EXISTS ( SELECT 1
   FROM teachers
  WHERE ((teachers.id = classrooms.teacher_id) AND (teachers.user_id = (select auth.uid()))))));
ALTER POLICY "Admin yazabilir" ON public.curriculum USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.is_admin = true)))));
ALTER POLICY error_reports_admin ON public.error_reports USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.is_admin = true)))));
ALTER POLICY "Admin exam_chunks" ON public.exam_chunks USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.is_admin = true)))));
ALTER POLICY "Admin exam_resources" ON public.exam_resources USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.is_admin = true)))));
ALTER POLICY "Kullanici kendi sinavini gunceller" ON public.exam_sessions USING (((select auth.uid()) = user_id));
ALTER POLICY "Kullanici kendi sinavlarini gorur" ON public.exam_sessions USING (((select auth.uid()) = user_id));
ALTER POLICY grade_notes_select_own ON public.grade_notes USING (((select auth.uid()) = user_id));
ALTER POLICY grade_notes_write_unaffiliated_only ON public.grade_notes USING ((((select auth.uid()) = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM institution_users iu
  WHERE ((iu.user_id = grade_notes.user_id) AND (iu.role = 'student'::text)))))));
ALTER POLICY "Users can leave institution" ON public.institution_users USING (((user_id = (select auth.uid())) AND (role = 'student'::text)));
ALTER POLICY "Users can view own institution membership" ON public.institution_users USING ((user_id = (select auth.uid())));
ALTER POLICY institution_users_own ON public.institution_users USING (((select auth.uid()) = user_id));
ALTER POLICY students_leave_institution ON public.institution_users USING ((((select auth.uid()) = user_id) AND (role = 'student'::text)));
ALTER POLICY "Kullanici kendi cevabini gunceller" ON public.live_quiz_answers USING (((select auth.uid()) = user_id));
ALTER POLICY "Öğretmen kendi quizini günceller" ON public.live_quizzes USING ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = (select auth.uid())))));
ALTER POLICY admin_all_chunks ON public.meb_chunks USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.is_admin = true)))));
ALTER POLICY admin_all ON public.meb_resources USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.is_admin = true)))));
ALTER POLICY "Kullanıcı kendi bildirimlerini yönetir" ON public.notifications USING (((select auth.uid()) = user_id));
ALTER POLICY users_delete_own_notifications ON public.notifications USING (((select auth.uid()) = user_id));
ALTER POLICY users_read_own_notifications ON public.notifications USING (((select auth.uid()) = user_id));
ALTER POLICY users_update_own_notifications ON public.notifications USING (((select auth.uid()) = user_id));
ALTER POLICY open_ended_own_select ON public.open_ended_sessions USING (((select auth.uid()) = user_id));
ALTER POLICY child_see_own ON public.parent_children USING (((select auth.uid()) = child_id));
ALTER POLICY parent_own_children ON public.parent_children USING (((select auth.uid()) = parent_id));
ALTER POLICY plan_progress_own ON public.plan_progress USING (((select auth.uid()) = user_id));
ALTER POLICY profiles_select ON public.profiles USING (((select auth.uid()) = id));
ALTER POLICY profiles_select_all ON public.profiles USING (((select auth.role()) = 'authenticated'::text));
ALTER POLICY profiles_update_own ON public.profiles USING (((select auth.uid()) = id));
ALTER POLICY push_own ON public.push_subscriptions USING (((select auth.uid()) = user_id));
ALTER POLICY quiz_sessions_select_own ON public.quiz_sessions USING (((select auth.uid()) = user_id));
ALTER POLICY quiz_sessions_update_own ON public.quiz_sessions USING (((select auth.uid()) = user_id));
ALTER POLICY sessions_select_own ON public.quiz_sessions USING (((select auth.uid()) = user_id));
ALTER POLICY sessions_update_own ON public.quiz_sessions USING (((select auth.uid()) = user_id));
ALTER POLICY reading_attention_checks_own ON public.reading_attention_checks USING (((select auth.uid()) = user_id));
ALTER POLICY reading_materials_own ON public.reading_materials USING (((select auth.uid()) = user_id));
ALTER POLICY reading_sessions_own ON public.reading_sessions USING (((select auth.uid()) = user_id));
ALTER POLICY referrals_select_own ON public.referrals USING ((((select auth.uid()) = referrer_id) OR ((select auth.uid()) = referred_id)));
ALTER POLICY "Kullanici kart gunceller" ON public.spaced_repetition_cards USING (((select auth.uid()) = user_id));
ALTER POLICY "Kullanici kart siler" ON public.spaced_repetition_cards USING (((select auth.uid()) = user_id));
ALTER POLICY "Kullanici kendi kartlarini gorur" ON public.spaced_repetition_cards USING (((select auth.uid()) = user_id));
ALTER POLICY "Users manage own SR cards" ON public.spaced_repetition_cards USING ((user_id = (select auth.uid())));
ALTER POLICY streaks_own ON public.streaks USING (((select auth.uid()) = user_id));
ALTER POLICY streaks_select_own ON public.streaks USING (((select auth.uid()) = user_id));
ALTER POLICY streaks_update_own ON public.streaks USING (((select auth.uid()) = user_id));
ALTER POLICY student_grades_own_select ON public.student_grades USING (((select auth.uid()) = student_id));
ALTER POLICY study_plans_own ON public.study_plans USING (((select auth.uid()) = user_id));
ALTER POLICY subscriptions_select_own ON public.subscriptions USING (((select auth.uid()) = user_id));
ALTER POLICY teacher_own_notes ON public.teacher_notes USING ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = (select auth.uid())))));
ALTER POLICY "Öğretmen kendi bildirimlerini görür" ON public.teacher_notifications USING ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = (select auth.uid())))));
ALTER POLICY teacher_own_analyses ON public.teacher_student_analyses USING ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = (select auth.uid())))));
ALTER POLICY teachers_select_own ON public.teachers USING (((select auth.uid()) = user_id));
ALTER POLICY "Öğretmen kendi kaydını görür" ON public.teachers USING (((select auth.uid()) = user_id));
ALTER POLICY "Öğretmen kendi kaydını günceller" ON public.teachers USING (((select auth.uid()) = user_id));
ALTER POLICY notes_own ON public.user_notes USING (((select auth.uid()) = user_id));
ALTER POLICY weak_topics_own ON public.weak_topics USING (((select auth.uid()) = user_id));

-- WITH CHECK ifadeleri
ALTER POLICY ab_assignments_own ON public.ab_assignments WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY ab_events_insert_own ON public.ab_events WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "Öğrenci kendi tamamlamasını kaydeder" ON public.assignment_completions WITH CHECK ((student_id = (select auth.uid())));
ALTER POLICY "Kullanici attempt ekler" ON public.challenge_attempts WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "Kullanici challenge olusturur" ON public.challenges WITH CHECK (((select auth.uid()) = creator_id));
ALTER POLICY class_members_insert_own ON public.class_members WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY members_insert_own ON public.class_members WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY classes_insert_teacher ON public.classes WITH CHECK (((select auth.uid()) = teacher_id));
ALTER POLICY cs_insert_own ON public.classroom_students WITH CHECK (((select auth.uid()) = student_id));
ALTER POLICY cs_student_insert ON public.classroom_students WITH CHECK ((student_id = (select auth.uid())));
ALTER POLICY classrooms_teacher_all ON public.classrooms WITH CHECK ((EXISTS ( SELECT 1
   FROM teachers
  WHERE ((teachers.id = classrooms.teacher_id) AND (teachers.user_id = (select auth.uid()))))));
ALTER POLICY error_reports_insert ON public.error_reports WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "Kullanici kendi sinavini olusturur" ON public.exam_sessions WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY grade_notes_write_unaffiliated_only ON public.grade_notes WITH CHECK ((((select auth.uid()) = user_id) AND (NOT (EXISTS ( SELECT 1
   FROM institution_users iu
  WHERE ((iu.user_id = grade_notes.user_id) AND (iu.role = 'student'::text)))))));
ALTER POLICY "Students can join institutions" ON public.institution_users WITH CHECK (((user_id = (select auth.uid())) AND (role = 'student'::text)));
ALTER POLICY students_join_institution ON public.institution_users WITH CHECK ((((select auth.uid()) = user_id) AND (role = 'student'::text)));
ALTER POLICY "Kullanici kendi cevabini gonderir" ON public.live_quiz_answers WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "Öğretmen kendi quizini oluşturur" ON public.live_quizzes WITH CHECK ((teacher_id IN ( SELECT teachers.id
   FROM teachers
  WHERE (teachers.user_id = (select auth.uid())))));
ALTER POLICY profiles_insert_own ON public.profiles WITH CHECK (((select auth.uid()) = id));
ALTER POLICY quiz_sessions_insert ON public.quiz_sessions WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY quiz_sessions_insert_own ON public.quiz_sessions WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY sessions_insert_own ON public.quiz_sessions WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY reading_attention_checks_own ON public.reading_attention_checks WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY reading_materials_own ON public.reading_materials WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY reading_sessions_own ON public.reading_sessions WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY referrals_insert ON public.referrals WITH CHECK (((select auth.uid()) = referred_id));
ALTER POLICY "Kullanici kart olusturur" ON public.spaced_repetition_cards WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "Users manage own SR cards" ON public.spaced_repetition_cards WITH CHECK ((user_id = (select auth.uid())));
ALTER POLICY streaks_insert_own ON public.streaks WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY streaks_own ON public.streaks WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY "Kayıt oluşturabilir" ON public.teachers WITH CHECK (((select auth.uid()) = user_id));
ALTER POLICY teachers_insert_own ON public.teachers WITH CHECK (((select auth.uid()) = user_id));
