-- TR-PG (VPS, pratium_identity) üzerinde ÇALIŞTIRILMASI GEREKEN ek: posta kodu ve açık adres.
-- Bu betik uygulama deposundan otomatik uygulanmaz. Çalıştırılmadan önce uygulama bu alanları
-- yazmayı dener ve hata alırsa kaydı bozmadan yalnızca uyarı günlüğü düşer (veri kaydedilmez).
ALTER TABLE identities
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS address_line text;
