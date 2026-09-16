-- Bagimsiz platform saticilari (bireysel pazarlamacilar) - kurum kodundan
-- farkli, komisyon takibi icin. Bir satici hem KURUMLARI hem BIREYSEL
-- kullanicilari getirebilir - ikisi de asagida ayri sutunlarla baglanir.
CREATE TABLE IF NOT EXISTS public.sellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  title text,                          -- unvan (opsiyonel)
  email text,
  phone text,
  address text,
  commission_rate numeric NOT NULL DEFAULT 0, -- % olarak, orn 10.00 = %10 (anlasilan oran)
  code text UNIQUE NOT NULL,           -- sistem tarafindan otomatik atanan satici kodu
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Kurumlar bir saticiya baglanabilir (kurum tanimlama/duzenleme ekraninda
-- secilir - opsiyonel, NULL = dogrudan/saticisiz kurum)
ALTER TABLE public.institutions ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_institutions_seller_id ON public.institutions(seller_id);

-- Bireysel kayitlar da (?satici=KOD linki ile) bir saticiya baglanabilir
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_seller_id ON public.profiles(seller_id);

-- sellers tablosu sadece service_role (admin route'lari) uzerinden yonetilir -
-- ne anon ne authenticated dogrudan erisir (satici bilgileri PII/ticari icerir)
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY sellers_service_role_only ON public.sellers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
