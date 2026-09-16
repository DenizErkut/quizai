ALTER TABLE public.weak_topics
  ADD COLUMN risk_notified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.weak_topics.risk_notified IS 'Veliye bu risk döneminde (mastery düşük kaldığı sürece) zaten proaktif bildirim gönderildi mi -- tekrar tekrar bildirim göndermemek için. Mastery iyileşince false''a resetlenir, böylece gelecekteki bir gerileme yeniden bildirebilir.';
