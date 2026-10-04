-- The browser may edit profile preferences, never authority or billing.
-- Service-role server handlers retain their existing privileges.
REVOKE ALL ON public.profiles FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
 GRANT UPDATE (name,surname,gender,grade,school,language,instagram,tiktok,avatar_url,
  role,onboarding_completed,phone,class_number,seller_id,department,target_exam,
  priority_subjects,priority_setup_completed) ON public.profiles TO authenticated;

ALTER POLICY profiles_insert_own ON public.profiles TO authenticated
WITH CHECK ((SELECT auth.uid())=id AND coalesce(is_admin,false)=false
  AND plan='free' AND plan_expires_at IS NULL
  AND coalesce(monthly_test_count,0)=0 AND coalesce(daily_test_count,0)=0
  AND role IN ('student','parent','teacher'));
ALTER POLICY profiles_update_own ON public.profiles TO authenticated
USING ((SELECT auth.uid())=id) WITH CHECK ((SELECT auth.uid())=id);
ALTER POLICY profiles_select_merged ON public.profiles TO authenticated USING (
  id=(SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.parent_children pc WHERE pc.child_id=profiles.id AND pc.parent_id=(SELECT auth.uid()))
  OR EXISTS (SELECT 1 FROM public.classroom_students cs
    JOIN public.classrooms c ON c.id=cs.classroom_id
    JOIN public.teachers t ON t.id=c.teacher_id
    WHERE cs.student_id=profiles.id AND t.user_id=(SELECT auth.uid()) AND t.approved)
);

CREATE OR REPLACE FUNCTION public.guard_profile_role_v1() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND NEW.role IS DISTINCT FROM OLD.role
    AND (NEW.role NOT IN ('student','parent','teacher') OR OLD.role NOT IN ('student','parent','teacher')) THEN
    RAISE EXCEPTION 'Role changes require an authorized server operation' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_profile_role_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER profiles_guard_role BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_role_v1();

-- A teacher cannot approve their own application or grant bank editing.
REVOKE ALL ON public.teachers FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.teachers FROM authenticated;
GRANT UPDATE (school,subject,phone,document_url,document_urls) ON public.teachers TO authenticated;
ALTER POLICY "Kayıt oluşturabilir" ON public.teachers TO authenticated
WITH CHECK (user_id=(SELECT auth.uid()) AND coalesce(approved,false)=false AND coalesce(question_bank_editor,false)=false);

-- Parent linkage must validate the child's invitation code server-side.
REVOKE INSERT,UPDATE,TRUNCATE,REFERENCES,TRIGGER ON public.parent_children FROM anon,authenticated;
GRANT UPDATE (nickname) ON public.parent_children TO authenticated;
