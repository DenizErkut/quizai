-- Güvenlik raporu (19 Ekim 2026) — Gün 1 veritabanı düzeltmeleri (üretimde uygulandı).
-- DROP yerine ALTER POLICY kullanıldı: politikalar silinmeden kapsamı daraltılır.
-- D1: api_rate_limits yalnızca servis rolüne açık (önceden `public` rolüne tam yetkiliydi).
-- D2: live_quiz_answers: kendi cevabın, kendi sınıfının canlı sınavı ya da sahibi öğretmen.
-- D3: class_members / classes / challenge_attempts: yalnızca sahibi okuyabilir.
-- Bu tabloların anon yetkileri kaldırıldı.

ALTER POLICY "Service role manages rate limits" ON public.api_rate_limits TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION private.can_read_live_quiz_answers(p_live_quiz_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.live_quizzes lq
    WHERE lq.id = p_live_quiz_id AND (
      EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = lq.teacher_id AND t.user_id = (SELECT auth.uid()))
      OR EXISTS (SELECT 1 FROM public.classroom_students cs WHERE cs.classroom_id = lq.classroom_id AND cs.student_id = (SELECT auth.uid()))
    )
  )
$$;
REVOKE ALL ON FUNCTION private.can_read_live_quiz_answers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_live_quiz_answers(uuid) TO authenticated;

ALTER POLICY "Herkes cevaplari gorebilir (liderboard icin)" ON public.live_quiz_answers TO authenticated
  USING (user_id = (SELECT auth.uid()) OR private.can_read_live_quiz_answers(live_quiz_id));
ALTER POLICY class_members_select_all ON public.class_members TO authenticated USING (user_id = (SELECT auth.uid()));
ALTER POLICY classes_read ON public.classes TO authenticated USING (teacher_id = (SELECT auth.uid()));
ALTER POLICY "Herkes attempt gorebilir" ON public.challenge_attempts TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.live_quiz_answers, public.class_members, public.classes, public.challenge_attempts FROM anon;
