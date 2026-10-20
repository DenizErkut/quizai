-- Güvenlik raporu (D9, 20 Ekim 2026): live_quizzes bitmemiş sınavlarının `questions` alanı (doğru cevaplar dahil)
-- oturumsuz herkese okunabiliyordu. Artık yalnızca sınıfın öğrencileri ve sahibi öğretmen görür (üretimde uygulandı).
ALTER POLICY "Herkes aktif quizleri görebilir" ON public.live_quizzes TO authenticated
  USING (status <> 'finished' AND private.can_read_live_quiz_answers(id));
REVOKE ALL ON public.live_quizzes FROM anon;
