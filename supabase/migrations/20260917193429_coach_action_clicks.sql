-- Pratium Koç — kullanım analitikleri: "Çalışmayı başlat" butonuna
-- tıklanma oranı. Faz C, koçun önerisini coach_messages.action alanında
-- saklıyor (kaç mesajda bir öneri SUNULDU'ğunu buradan sayabiliyoruz) ama
-- öğrencinin o öneriyi gerçekten TIKLAYIP TIKLAMADIĞINI hiçbir yerde
-- kaydetmiyordu. Bu tablo sadece o tıklama olayını tutar — app/koc/page.tsx
-- startPractice() çağrıldığında (yani /quiz'e yönlendirmeden hemen önce)
-- bir satır ekler.

CREATE TABLE IF NOT EXISTS public.coach_action_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.coach_messages(id) ON DELETE SET NULL,
  topic text NOT NULL,
  recommendation_id uuid,
  clicked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coach_action_clicks_user_idx
  ON public.coach_action_clicks (user_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS coach_action_clicks_clicked_at_idx
  ON public.coach_action_clicks (clicked_at DESC);

ALTER TABLE public.coach_action_clicks ENABLE ROW LEVEL SECURITY;

-- coach_messages_insert_own ile aynı desen: kullanıcı sadece kendi
-- tıklama olayını ekleyebilir/okuyabilir, değiştiremez/silemez.
DROP POLICY IF EXISTS coach_action_clicks_insert_own ON public.coach_action_clicks;
CREATE POLICY coach_action_clicks_insert_own
  ON public.coach_action_clicks FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS coach_action_clicks_select_own ON public.coach_action_clicks;
CREATE POLICY coach_action_clicks_select_own
  ON public.coach_action_clicks FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

GRANT SELECT, INSERT ON public.coach_action_clicks TO authenticated;
GRANT ALL ON public.coach_action_clicks TO service_role;

COMMENT ON TABLE public.coach_action_clicks IS
  'Pratium Koç — "Çalışmayı başlat" butonuna tıklanma olayları (click-through analitiği için).';
