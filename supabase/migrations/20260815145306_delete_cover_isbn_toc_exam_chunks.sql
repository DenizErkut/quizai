-- 5 sınav kitapçığında chunk 0 (kapak), 1 (ISBN/yayın hakları/MEB
-- künye), 4 (İçindekiler) -- hepsi doğrulandı: gerçek soru içeriği
-- taşımıyor, soru üretimine yaramayan ön/son sayfa materyali.
DELETE FROM exam_chunks
WHERE exam_resource_id IN (
  '52facbc5-466e-4038-bc6a-54ac9464a669','67899ecd-7b83-4559-8e35-bc4d9cc19247',
  'ab2a77cc-b96e-4518-ba00-4635cc7c9067','fbd60aae-5fb7-44c0-8950-63bb0b068747',
  'ff04643d-fc50-43f8-98d9-c6c7ae4f9b10'
)
AND chunk_index IN (0, 1, 4);
