-- QR kod ile giriş: başka cihazdaki oturum açık hesap, QR'ı onaylayarak bu cihazda giriş yaptırır.
-- Yalnızca sunucu (service_role) erişir; gizli değerin yalnızca özeti saklanır, kayıt 3 dakika geçerlidir ve tek kullanımlıktır.
CREATE TABLE IF NOT EXISTS public.qr_login_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'consumed')),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '3 minutes',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.qr_login_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.qr_login_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.qr_login_requests TO service_role;
