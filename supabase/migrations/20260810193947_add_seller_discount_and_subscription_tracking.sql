-- Satıcının kendi müşterilerine sunabileceği indirim oranı (komisyon oranından
-- AYRI bir kavram: komisyon Pratium'un satıcıya ödediği pay, indirim ise
-- satıcının kendi müşterisine sunduğu fiyat kırılması).
ALTER TABLE public.sellers
  ADD COLUMN discount_rate numeric NOT NULL DEFAULT 0
  CHECK (discount_rate >= 0 AND discount_rate <= 100);

COMMENT ON COLUMN public.sellers.discount_rate IS 'Bu satıcının kodu/linki üzerinden gelen müşterilere ödeme sırasında uygulanan indirim yüzdesi (0-100). commission_rate''den farklı: o Pratium''un satıcıya ödediği komisyon.';

-- Hangi aboneliğin hangi satıcı üzerinden geldiğini ve o an geçerli olan
-- indirim oranını / ödenen gerçek fiyatı kalıcı olarak (satıcının oranı
-- ileride değişse bile tarihsel doğruluk bozulmasın diye) saklar.
ALTER TABLE public.subscriptions
  ADD COLUMN seller_id uuid REFERENCES public.sellers(id),
  ADD COLUMN discount_rate numeric,
  ADD COLUMN price_paid numeric;

COMMENT ON COLUMN public.subscriptions.seller_id IS 'Bu aboneliğin hangi satıcının kodu/linki üzerinden geldiği (varsa). profiles.seller_id ile aynı değeri taşır, satın alma anında kopyalanır.';
COMMENT ON COLUMN public.subscriptions.discount_rate IS 'Satın alma anında uygulanan indirim yüzdesi (satıcının o anki discount_rate değerinin anlık görüntüsü — satıcının oranı sonradan değişse bile bu kayıt değişmez).';
COMMENT ON COLUMN public.subscriptions.price_paid IS 'İndirim uygulandıktan sonra gerçekten ödenen tutar (TRY).';
