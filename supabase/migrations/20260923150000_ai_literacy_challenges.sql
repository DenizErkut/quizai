-- AI Literacy Mode — 23 Eylül 2026 uyum-raporu güncellemesindeki haber
-- analizinden (Sky News: gençlerin %47'si fact-checking için AI'a bir
-- insandan daha fazla güveniyor; Education Week: Google'ın Gemini'yi
-- farklılaşmadan tüm K-12'ye açması okulları hazırlıksız yakaladı)
-- doğan somut özellik: öğrenciye aynı soruya verilmiş iki AI cevabı
-- gösterilir (biri doğru, biri gerçekçi ama hatalı — hesaplama hatası,
-- kavram yanılgısı, uydurma/halüsinasyon bilgi ya da eksik muhakeme),
-- öğrenci hangisinin doğru olduğunu VE NEDEN olduğunu belirlemeye
-- çalışır. Amaç doğru cevabı öğretmek değil, AI çıktısını sorgulama
-- becerisini (Ask → Verify → Challenge → Compare → Decide) alıştırmak.
--
-- Tasarım notu: student_choice/is_correct ikili (A/B) karşılaştırmayla
-- otomatik puanlanıyor. student_reasoning (öğrencinin "neden" açıklaması)
-- şu an AI ile ayrıca puanlanmıyor — bilinçli bir MVP kapsam kararı:
-- ikinci bir AI çağrısı eklemek yerine, üretim anında zaten hazırlanmış
-- flaw_explanation/correct_reasoning öğrenciye geri bildirim olarak
-- gösteriliyor, öğrencinin kendi metni ham haliyle saklanıyor (ileride
-- öğretmen incelemesi veya bir rubrik-puanlama katmanı eklenebilir).
CREATE TABLE IF NOT EXISTS public.ai_literacy_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  topic text NOT NULL,
  grade text,
  question text NOT NULL,
  answer_a text NOT NULL,
  answer_b text NOT NULL,
  correct_choice text NOT NULL CHECK (correct_choice IN ('A', 'B')),
  flaw_type text NOT NULL CHECK (flaw_type IN ('hesaplama_hatasi', 'kavram_yanilgisi', 'halusinasyon', 'eksik_muhakeme')),
  flaw_explanation text NOT NULL,
  correct_reasoning text NOT NULL,
  student_choice text CHECK (student_choice IN ('A', 'B')),
  student_reasoning text,
  is_correct boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  answered_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_literacy_challenges_student_idx
  ON public.ai_literacy_challenges (student_id, created_at DESC);

ALTER TABLE public.ai_literacy_challenges ENABLE ROW LEVEL SECURITY;

-- coach_conversations_own ile aynı desen: öğrenci sadece kendi
-- kayıtlarını okuyabilir/oluşturabilir/güncelleyebilir (cevap gönderirken).
DROP POLICY IF EXISTS ai_literacy_challenges_own ON public.ai_literacy_challenges;
CREATE POLICY ai_literacy_challenges_own
  ON public.ai_literacy_challenges FOR ALL TO authenticated
  USING ((select auth.uid()) = student_id)
  WITH CHECK ((select auth.uid()) = student_id);

GRANT SELECT, INSERT, UPDATE ON public.ai_literacy_challenges TO authenticated;
GRANT ALL ON public.ai_literacy_challenges TO service_role;

COMMENT ON TABLE public.ai_literacy_challenges IS
  'AI Literacy Mode — öğrenciye iki AI cevabından hangisinin doğru olduğunu sorgulatan pratik. 23 Eylül 2026 haber-analizi raporundan (bkz. claude/pratium-haber-analizi-firsat-raporu-23-eylul-2026.md, Tema 3).';
COMMENT ON COLUMN public.ai_literacy_challenges.flaw_type IS
  'Yanlış cevabın hata türü: hesaplama_hatasi, kavram_yanilgisi, halusinasyon (uydurma bilgi) veya eksik_muhakeme.';
