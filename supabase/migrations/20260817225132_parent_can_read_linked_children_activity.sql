-- Veli paneli (app/parent/page.tsx), bağlı bir çocuğun quiz_sessions, streaks,
-- weak_topics ve assignment_completions kayıtlarını tarayıcıdan (anon key +
-- velinin kendi oturumu) doğrudan Supabase'e sorgu atarak okuyor. Bu tablolarda
-- şu ana kadar sadece "kendi kaydını görürsün" (auth.uid() = user_id) kuralı
-- vardı; veli-çocuk ilişkisi için hiçbir istisna yoktu. Sonuç: RLS bu sorguları
-- hatasız ama SESSİZCE boş döndürüyordu — veli panelinde "0 test", "—" gibi
-- değerler gerçek veri olsa bile hep böyle görünüyordu.
--
-- Bu migration, SADECE parent_children tablosunda kayıtlı, gerçekten bağlı
-- olunan çocuklar için ek (additive) SELECT izni ekliyor. Mevcut policy'lere
-- dokunmuyor; Postgres RLS'te aynı komut için birden fazla PERMISSIVE policy
-- OR'lanır, yani öğrencinin kendi erişimi ve öğretmen erişimi (varsa) aynen
-- korunuyor, üstüne veli erişimi ekleniyor.

CREATE POLICY "quiz_sessions_select_parent" ON public.quiz_sessions
  FOR SELECT
  USING (
    user_id IN (
      SELECT child_id FROM public.parent_children WHERE parent_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "streaks_select_parent" ON public.streaks
  FOR SELECT
  USING (
    user_id IN (
      SELECT child_id FROM public.parent_children WHERE parent_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "weak_topics_select_parent" ON public.weak_topics
  FOR SELECT
  USING (
    user_id IN (
      SELECT child_id FROM public.parent_children WHERE parent_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "assignment_completions_select_parent" ON public.assignment_completions
  FOR SELECT
  USING (
    student_id IN (
      SELECT child_id FROM public.parent_children WHERE parent_id = (SELECT auth.uid())
    )
  );
