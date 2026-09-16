ALTER TABLE public.study_plans
  ADD COLUMN goals_snapshot jsonb;

COMMENT ON COLUMN public.study_plans.goals_snapshot IS 'Plan oluşturulduğu andaki otonom hedeflerin (topic + masteryScore) anlık görüntüsü -- bir sonraki plan yenilemesinde "geçen haftaki hedefler nasıl gitti" karşılaştırması için (Faz 7, sürekli öğrenme döngüsü: Ölç -> Analiz Et -> Karar Ver -> Öğret -> Tekrar Ölç -> Sonucu Değerlendir -> Planı Güncelle).';
