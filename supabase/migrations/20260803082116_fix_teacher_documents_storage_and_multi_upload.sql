-- Sorun: 'teacher-documents' bucket'i icin storage.objects uzerinde HIC RLS
-- politikasi yoktu - bucket private oldugu icin authenticated kullanicilar
-- hicbir zaman dosya yukleyemiyordu (sessizce basarisiz oluyordu, kod da
-- hatayi kontrol etmiyordu). Bu, dort ayri ogretmen basvuru noktasinin
-- hepsini etkiliyordu.

-- Yol yapisini klasor-bazli hale getiriyoruz (teacher-docs/{user_id}/...)
-- ki RLS politikasi kullanicinin SADECE kendi klasorune yazabilmesini
-- net bir sekilde kontrol edebilsin.

CREATE POLICY "teacher_docs_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'teacher-documents'
  AND (storage.foldername(name))[1] = 'teacher-docs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "teacher_docs_select_own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'teacher-documents'
  AND (storage.foldername(name))[1] = 'teacher-docs'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

-- Coklu belge destegi icin yeni kolon (mevcut tekil document_url kalir,
-- geriye donuk uyumluluk icin)
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS document_urls text[];
