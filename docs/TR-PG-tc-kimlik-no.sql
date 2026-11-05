-- TR-PG (VPS, pratium_identity) üzerinde ÇALIŞTIRILMASI GEREKEN ek: T.C. Kimlik No.
-- Bu betik uygulama deposundan otomatik uygulanmaz. Çalıştırılmadan önce uygulama kayıtta numarayı
-- doğrular ama saklamaz (sütun yoksa kaydı bozmadan yalnızca uyarı düşer).
-- KVKK: yalnızca bu Türkiye'deki veritabanında tutulur; Supabase'e, günlüklere ve API yanıtlarına yazılmaz.
ALTER TABLE identities
  ADD COLUMN IF NOT EXISTS national_id text;

-- Biçim kısıtı: 11 hane, 0 ile başlamaz, son hane çift (T.C. Kimlik No kuralı). Sağlama basamakları uygulamada doğrulanır.
ALTER TABLE identities
  DROP CONSTRAINT IF EXISTS identities_national_id_format;
ALTER TABLE identities
  ADD CONSTRAINT identities_national_id_format
  CHECK (national_id IS NULL OR national_id ~ '^[1-9][0-9]{9}[02468]$');

-- Not: Benzersizlik kısıtı bilerek eklenmedi (aynı kişinin veli/öğrenci gibi birden fazla hesabı olabilir ve
-- bir numaranın "zaten kayıtlı" yanıtı numara sorgulamasına yol açar). İsterseniz kısmi benzersiz dizin ekleyebilirsiniz:
-- CREATE UNIQUE INDEX IF NOT EXISTS identities_national_id_key ON identities (national_id) WHERE national_id IS NOT NULL;

-- Yetki: uygulama kullanıcısı zaten identities tablosuna yazıyor; ek GRANT gerekmez.
-- Erişim kısıtı: pg_stat_statements/yedekleme dışa aktarımlarında bu sütunun şifreli diskte olduğundan emin olun.
