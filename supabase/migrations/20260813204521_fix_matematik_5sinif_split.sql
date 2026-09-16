-- "Sayılar ve Nicelikler" kaynağının kendi mükerrer 64 chunk'ı siliniyor
DELETE FROM meb_chunks WHERE resource_id = 'b15f3104-a440-4654-9a11-9a7d7549fedd';

-- Unit 2 (Sayılar ve Nicelikler, chunk 32-63) doğru kaynağa taşınıyor
UPDATE meb_chunks SET resource_id = 'b15f3104-a440-4654-9a11-9a7d7549fedd', unit = '2. Tema: Sayılar ve Nicelikler (1): Doğal Sayılar ve İşlemler'
WHERE resource_id = '0335a384-c55d-479b-b10f-72f46e2cf152' AND chunk_index BETWEEN 32 AND 63;

-- 0335a384'te sadece Unit 1 (Geometrik Şekiller, chunk 5-31) kalıyor;
-- ön sayfa (0-4) siliniyor
DELETE FROM meb_chunks
WHERE resource_id = '0335a384-c55d-479b-b10f-72f46e2cf152' AND chunk_index NOT BETWEEN 5 AND 31;
