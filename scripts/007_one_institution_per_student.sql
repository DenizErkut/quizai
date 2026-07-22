-- 007_one_institution_per_student.sql — Supabase'de MCP ile uygulandı, 21.07.2026
--
-- Kök neden: app/profile/edit/page.tsx, bir öğrencinin institution_users'ta
-- EN FAZLA 1 satırı olacağını varsayıp .maybeSingle() kullanıyordu. Ama
-- bunu zorunlu kılan bir DB kısıtı yoktu — test hesaplarından biri
-- (668e2a19...) iki farklı kuruma 'student' olarak üye olmuştu.
-- .maybeSingle() 2+ satır dönünce hata fırlatır (sessizce yutulup boş
-- state'e düşülüyordu) — kullanıcı gerçekten kayıtlı olsa bile arayüzde
-- "kayıtlı değilsin" görünüyordu.
--
-- (Bu, aynı oturumda önce düzeltilen institution_admin_view RLS
-- recursion'ından AYRI, ikinci bir bug'dı — recursion düzelince sorgu
-- gerçekten çalışmaya başladı ve bu ikinci sorunu ortaya çıkardı.)

-- 1) Bu test hesabının eski (aktif test edilmeyen) kurum üyeliği temizlendi
DELETE FROM institution_users
WHERE user_id = '668e2a19-15ce-4997-9983-e070510c94a4'
  AND institution_id = 'c427f984-cfda-4609-a7cf-0e753bef6c7a';

-- 2) Bundan sonra bir öğrenci aynı anda sadece TEK kuruma üye olabilir
--    (admin rolü için kısıtlama yok — bir kişi birden fazla kurumu
--    yönetiyor olabilir, bu meşru bir senaryo)
CREATE UNIQUE INDEX one_institution_per_student
  ON institution_users (user_id)
  WHERE role = 'student';

-- 3) Kod tarafı: app/api/institution/join/route.ts artık "zaten başka bir
--    kuruma üyesin" durumunu kullanıcı dostu bir hatayla karşılıyor
--    (önceden bu durumda ham Postgres unique-violation hatası dönerdi).
--    app/profile/edit/page.tsx artık .maybeSingle() yerine
--    .order('joined_at', desc).limit(1) kullanıyor — geçiş döneminde
--    (constraint eklenmeden önceki) olası kalıntı verilere karşı savunma.
