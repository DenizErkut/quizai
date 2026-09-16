-- Supabase performans danismaninin bulduğu 29 index'siz foreign key icin
-- kapsayici index'ler ekleniyor. Ekleyici/guvenli islem - mevcut veriyi ya
-- da davranisi degistirmez, sadece sorgu planlayicisinin bu FK'lari
-- kullanan JOIN/WHERE/DELETE CASCADE islemlerini hizli yapmasini saglar.

CREATE INDEX IF NOT EXISTS idx_ab_assignments_test_id ON public.ab_assignments(test_id);
CREATE INDEX IF NOT EXISTS idx_ab_events_user_id ON public.ab_events(user_id);
CREATE INDEX IF NOT EXISTS idx_assignment_completions_session_id ON public.assignment_completions(session_id);
CREATE INDEX IF NOT EXISTS idx_assignment_completions_student_id ON public.assignment_completions(student_id);
CREATE INDEX IF NOT EXISTS idx_assignments_classroom_id ON public.assignments(classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON public.assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_challenge_attempts_user_id ON public.challenge_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_challenges_source_session_id ON public.challenges(source_session_id);
CREATE INDEX IF NOT EXISTS idx_class_members_user_id ON public.class_members(user_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classroom_students_student_id ON public.classroom_students(student_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_id ON public.classrooms(teacher_id);
CREATE INDEX IF NOT EXISTS idx_error_reports_user_id ON public.error_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_live_quiz_answers_user_id ON public.live_quiz_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_live_quizzes_classroom_id ON public.live_quizzes(classroom_id);
CREATE INDEX IF NOT EXISTS idx_live_quizzes_teacher_id ON public.live_quizzes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_meb_chunks_resource_id ON public.meb_chunks(resource_id);
CREATE INDEX IF NOT EXISTS idx_parent_children_child_id ON public.parent_children(child_id);
CREATE INDEX IF NOT EXISTS idx_plan_progress_user_id ON public.plan_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_attention_checks_user_id ON public.reading_attention_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_sessions_material_id ON public.reading_sessions(material_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_user_id ON public.study_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_teacher_notes_student_id ON public.teacher_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_notifications_classroom_id ON public.teacher_notifications(classroom_id);
CREATE INDEX IF NOT EXISTS idx_teacher_notifications_teacher_id ON public.teacher_notifications(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_student_analyses_assignment_id ON public.teacher_student_analyses(assignment_id);
CREATE INDEX IF NOT EXISTS idx_teacher_student_analyses_student_id ON public.teacher_student_analyses(student_id);
CREATE INDEX IF NOT EXISTS idx_user_notes_user_id ON public.user_notes(user_id);

-- Bonus: ayni danismanin bulduğu birebir ayni iki index'ten birini temizle
DROP INDEX IF EXISTS public.sr_cards_due_idx; -- idx_sr_cards_due ile birebir ayni, ikisine gerek yok
