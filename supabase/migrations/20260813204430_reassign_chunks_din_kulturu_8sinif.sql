-- "Kader İnancı" kaynağının kendi mükerrer 120 chunk'ı siliniyor
DELETE FROM meb_chunks WHERE resource_id = '93556502-582d-46a6-acd3-752b46f79152';

-- Unit 1 (Kader İnancı, chunk 7-32) doğru kaynağa taşınıyor
UPDATE meb_chunks SET resource_id = '93556502-582d-46a6-acd3-752b46f79152', unit = '1. Ünite: Kader İnancı'
WHERE resource_id = '04d3eb32-cae6-421e-9f85-2c05986ca23c' AND chunk_index BETWEEN 7 AND 32;

-- Unit 2 (Zekât ve Sadaka, chunk 33-47)
UPDATE meb_chunks SET resource_id = 'f3360636-d1a6-41a1-958f-d60d56e59d4e', unit = '2. Ünite: Zekât ve Sadaka'
WHERE resource_id = '04d3eb32-cae6-421e-9f85-2c05986ca23c' AND chunk_index BETWEEN 33 AND 47;

-- Unit 3 (Din ve Hayat, chunk 48-72)
UPDATE meb_chunks SET resource_id = 'dfbd9073-c072-442d-b65e-c1f833d62178', unit = '3. Ünite: Din ve Hayat'
WHERE resource_id = '04d3eb32-cae6-421e-9f85-2c05986ca23c' AND chunk_index BETWEEN 48 AND 72;

-- Unit 4 (Hz. Muhammed'in Örnekliği, chunk 73-87)
UPDATE meb_chunks SET resource_id = '6b67a7b3-66f3-4a8e-8aab-7384aa645c8b', unit = '4. Ünite: Hz. Muhammed''in Örnekliği'
WHERE resource_id = '04d3eb32-cae6-421e-9f85-2c05986ca23c' AND chunk_index BETWEEN 73 AND 87;

-- 04d3eb32'de sadece Unit 5 (Kur'an-ı Kerim, chunk 88-107) kalıyor;
-- ön sayfa (0-6) ve son sayfa (sözlük/kaynakça/harita, 108-119) siliniyor
DELETE FROM meb_chunks
WHERE resource_id = '04d3eb32-cae6-421e-9f85-2c05986ca23c' AND chunk_index NOT BETWEEN 88 AND 107;
