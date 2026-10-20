-- Güvenlik raporu D9 devamı: canlı sınav doğru cevap anahtarı sınıf arkadaşlarının okuyabildiği
-- live_quizzes.questions içinden ayrı, istemciye ve realtime yayınına kapalı bir tabloya taşındı.
CREATE TABLE IF NOT EXISTS public.live_quiz_keys (
  live_quiz_id uuid NOT NULL REFERENCES public.live_quizzes(id) ON DELETE CASCADE,
  question_index integer NOT NULL CHECK (question_index >= 0),
  ans integer NOT NULL,
  exp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (live_quiz_id, question_index)
);
ALTER TABLE public.live_quiz_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.live_quiz_keys FROM anon, authenticated, PUBLIC;

-- Mevcut sınavların anahtarları (idempotent)
INSERT INTO public.live_quiz_keys (live_quiz_id, question_index, ans, exp)
SELECT lq.id, (e.ord - 1)::int, (e.q->>'ans')::int, e.q->>'exp'
FROM public.live_quizzes lq, LATERAL jsonb_array_elements(lq.questions) WITH ORDINALITY AS e(q, ord)
WHERE (e.q->>'ans') ~ '^[0-9]+$'
ON CONFLICT DO NOTHING;

-- Yeni kod dağıtıldıktan sonra: eski sorulardan `ans`/`exp` alanlarını kaldır
-- UPDATE public.live_quizzes SET questions = (SELECT coalesce(jsonb_agg(q - 'ans' - 'exp' ORDER BY ord), '[]'::jsonb) FROM jsonb_array_elements(questions) WITH ORDINALITY AS t(q, ord)) WHERE questions::text LIKE '%"ans"%';
