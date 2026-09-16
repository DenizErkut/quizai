-- 6 Eylül 2026 — Deniz'in kararı: artık YENİ kayıtlar için ücretsiz plan yok.
-- Mevcut 'free' kullanıcılar (zaten profiles tablosunda plan='free' olarak
-- kayıtlı) HİÇ DOKUNULMADI ve dokunulmayacak — sadece BUNDAN SONRA oluşacak
-- yeni profil satırlarının varsayılan değeri değişiyor. 'none' = "henüz plan
-- seçilmedi/satın alınmadı" — kod tarafında (generate-quiz, generate-open-ended,
-- generate-exam, quiz/page.tsx) bu durum artık AÇIKÇA 0 test hakkı olarak ele
-- alınıyor (önceki `?? 10` yanlış varsayılanları da bu değişiklikle düzeltildi).
ALTER TABLE profiles ALTER COLUMN plan SET DEFAULT 'none';
