-- Pratium Koç — Faz B: çok turlu sohbeti kalıcı kılan tablolar.
-- 17 Eylül 2026 — /api/ai-analysis tek seferlik bir metin üretiyordu,
-- konuşma hafızası yoktu. Bu tablolar her öğrenci için sürekli, çok turlu
-- bir "koç" konuşmasını saklar. Bağlam (mastery/streak/öneriler) HER
-- ZAMAN sunucu tarafında lib/coach-context.ts ile taze hesaplanır — bu
-- tablolar sadece diyaloğun kendisini (kim ne dedi) tutar, öğrenci
-- istatistiklerinin bir kopyasını değil.

CREATE TABLE IF NOT EXISTS public.coach_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_conversations_user_recent_idx
  ON public.coach_conversations (user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.coach_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  -- Faz C'de (eylem butonları) kullanılacak: { type: 'start_practice', topic, questionCount }
  -- gibi yapılandırılmış bir aksiyon. Şimdilik hep null.
  action jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_messages_conversation_idx
  ON public.coach_messages (conversation_id, created_at);

ALTER TABLE public.coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_messages ENABLE ROW LEVEL SECURITY;

-- study_plans_own ile aynı desen: kullanıcı SADECE kendi konuşmasını
-- okuyabilir/oluşturabilir/güncelleyebilir (last_message_at için).
DROP POLICY IF EXISTS coach_conversations_own ON public.coach_conversations;
CREATE POLICY coach_conversations_own
  ON public.coach_conversations FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Mesajlar kendi user_id'sini taşımıyor; sahiplik üst konuşma üzerinden
-- doğrulanıyor. Kullanıcı UPDATE/DELETE yapamaz (mesajlar değişmez) —
-- sadece SELECT ve INSERT.
DROP POLICY IF EXISTS coach_messages_select_own ON public.coach_messages;
CREATE POLICY coach_messages_select_own
  ON public.coach_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coach_conversations cc
    WHERE cc.id = coach_messages.conversation_id AND cc.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS coach_messages_insert_own ON public.coach_messages;
CREATE POLICY coach_messages_insert_own
  ON public.coach_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.coach_conversations cc
    WHERE cc.id = coach_messages.conversation_id AND cc.user_id = (select auth.uid())
  ));

GRANT SELECT, INSERT, UPDATE ON public.coach_conversations TO authenticated;
GRANT SELECT, INSERT ON public.coach_messages TO authenticated;
GRANT ALL ON public.coach_conversations TO service_role;
GRANT ALL ON public.coach_messages TO service_role;

COMMENT ON TABLE public.coach_conversations IS
  'Pratium Koç — her öğrenci için sürekli, çok turlu koçluk konuşması (Faz B).';
COMMENT ON TABLE public.coach_messages IS
  'Pratium Koç konuşma geçmişi. Bağlam verisi (mastery/streak/öneriler) burada saklanmaz, her istekte lib/coach-context.ts ile taze hesaplanır.';
