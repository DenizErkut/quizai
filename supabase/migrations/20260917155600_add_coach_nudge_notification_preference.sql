-- Pratium Koç, Faz D: kullanıcının proaktif koç bildirimlerini
-- kapatabilmesi için notification_preferences'a yeni bir sütun.
-- Diğer tüm tercihler gibi varsayılan true (opt-out modeli).
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS coach_nudge boolean NOT NULL DEFAULT true;
