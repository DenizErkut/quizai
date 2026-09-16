-- Faz 11'in kalan tahmin modeli: öğrenci disengagement riski (aktivite
-- sıklığı düşüşü, skordan bağımsız). Tekrar tekrar bildirim
-- gönderilmemesi için bir "son bildirildi" zaman damgası tutuluyor --
-- weak_topics.risk_notified ile aynı mantık (boolean yerine timestamp,
-- çünkü burada belirli bir aralıktan (14 gün) sonra yeniden
-- bildirebilmek istiyoruz, konu bazlı bir "toparlanma" sinyali yok).
ALTER TABLE public.profiles ADD COLUMN disengagement_notified_at timestamptz;

COMMENT ON COLUMN public.profiles.disengagement_notified_at IS 'Faz 11: en son ne zaman disengagement uyarısı gönderildi. 14 günden eskiyse tekrar bildirilebilir.';
