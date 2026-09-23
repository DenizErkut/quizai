-- 23 Eylül 2026 — Pratium AI-ekonomisi/veri-mimarisi uyum raporu, Tema 3
-- (agent kimlik/izin ayrımı) bulgusuna karşılık.
--
-- Şimdiye kadar lib/question-bank.ts -> promoteQuestionsToBank() AI
-- tarafından üretilmiş soruları HİÇBİR insan onayı olmadan doğrudan
-- review_status='approved' ile yazıyordu. app/api/admin/learning-graph-
-- suggest/route.ts'teki "AI asla canlıya doğrudan yazmaz, uzman onay
-- paketi oluşturur" deseninin bir benzeri burada yoktu — platformdaki en
-- yüksek hacimli AI-yazma yolu bu kontrolden muaftı.
--
-- Bu migration iki şeyi ayırır:
--   1. awaiting_expert_review = true: bir öğretmen düzeltmesi
--      (question-bank-review PATCH) veya bir öğrenci raporu
--      (report-question) sonrası candidate'e düşen satırlar. Bunlar
--      ASLA otomatik yükseltilmez — yalnızca bir insan approved/rejected
--      kararı verebilir.
--   2. awaiting_expert_review = false: promoteQuestionsToBank'in yeni
--      yazdığı, henüz hiçbir sorun bildirilmemiş taze AI üretimi.
--      Bunlar bir "gölge süresi" (varsayılan 48 saat) boyunca report_count
--      = 0 kalırsa otomatik approved'a yükselir — bu süre, soruyu ilk
--      gören öğrencinin onu raporlaması için makul bir pencere bırakır.
ALTER TABLE public.question_bank
  ADD COLUMN IF NOT EXISTS ai_provider text,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_policy_version text,
  ADD COLUMN IF NOT EXISTS awaiting_expert_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promoted_at timestamptz;

COMMENT ON COLUMN public.question_bank.awaiting_expert_review IS
  'true: öğretmen düzeltmesi veya öğrenci raporu sonrası candidate''e düştü — yalnızca insan onayıyla approved olabilir, otomatik yükseltilmez. false + candidate: taze AI üretimi, gölge süresi sonunda otomatik yükseltilmeye uygun.';

COMMENT ON COLUMN public.question_bank.ai_provider IS
  'promoteQuestionsToBank çağrısındaki source.engine''den türetilmiş sağlayıcı (anthropic/openai/mistral) — kaynak izlenebilirliği için.';

CREATE INDEX IF NOT EXISTS question_bank_autopromote_idx
  ON public.question_bank (created_at)
  WHERE review_status = 'candidate' AND awaiting_expert_review = false AND report_count = 0;

-- Gölge süresi dolan, hiç rapor almamış, insan incelemesi BEKLEMEYEN
-- candidate satırları approved'a yükseltir. p_shadow_hours parametrik —
-- ileride farklı bir pencere denenmek istenirse kod değişikliği gerekmez.
CREATE OR REPLACE FUNCTION public.promote_shadow_reviewed_question_bank_candidates(p_shadow_hours integer DEFAULT 48)
RETURNS integer
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH promoted AS (
    UPDATE public.question_bank
    SET review_status = 'approved',
        promoted_at = now(),
        updated_at = now()
    WHERE review_status = 'candidate'
      AND awaiting_expert_review = false
      AND report_count = 0
      AND created_at < now() - make_interval(hours => p_shadow_hours)
    RETURNING id
  )
  SELECT count(*)::integer FROM promoted;
$$;

REVOKE ALL ON FUNCTION public.promote_shadow_reviewed_question_bank_candidates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_shadow_reviewed_question_bank_candidates(integer) TO service_role;

COMMENT ON FUNCTION public.promote_shadow_reviewed_question_bank_candidates IS
  'AI tarafından üretilip question_bank''e candidate statüsüyle yazılmış, gölge süresi boyunca hiç rapor almamış soruları approved''a yükseltir. awaiting_expert_review=true olan (öğretmen/öğrenci kaynaklı re-review) satırları asla otomatik yükseltmez.';

-- Bir soru insan tarafından düzeltilip yeniden incelemeye alındığında ya da
-- bir öğrenci raporu sonrası karantinaya düştüğünde awaiting_expert_review
-- her zaman true olmalı — bu iki demotion yolu da artık uygulama kodunda
-- (app/api/report-question, app/api/admin/question-bank-review) ayrıca set
-- ediyor; burada yalnızca dokümantasyon amaçlı iz bırakılıyor.
