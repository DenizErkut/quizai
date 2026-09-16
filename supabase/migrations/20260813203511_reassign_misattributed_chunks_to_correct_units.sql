-- 2. Ünite (Kuvvetin Etkisinde Hareket) chunk'ları taşınıyor
UPDATE meb_chunks
SET resource_id = '4d1e0644-cd45-4e8d-a110-7539a795851a',
    unit = '2. Ünite: Kuvvetin Etkisinde Hareket'
WHERE resource_id = '0ad7b71a-f2be-4921-810d-4a67751b4cb5' AND chunk_index BETWEEN 27 AND 46;

-- 3. Ünite (Canlılarda Sistemler) chunk'ları taşınıyor
UPDATE meb_chunks
SET resource_id = '45012ea8-72ad-413d-9ed8-c9df8001c435',
    unit = '3. Ünite: Canlılarda Sistemler'
WHERE resource_id = '0ad7b71a-f2be-4921-810d-4a67751b4cb5' AND chunk_index BETWEEN 47 AND 89;

-- 4. Ünite (Işığın Yansıması ve Renkler) chunk'ları taşınıyor
UPDATE meb_chunks
SET resource_id = '7279e8f6-c3fc-4853-b337-238276efbbdb',
    unit = '4. Ünite: Işığın Yansıması ve Renkler'
WHERE resource_id = '0ad7b71a-f2be-4921-810d-4a67751b4cb5' AND chunk_index BETWEEN 90 AND 116;

-- Ön sayfa (0-7) ve kaynakça/harita eki (117-119): içerik değil, siliniyor
DELETE FROM meb_chunks
WHERE resource_id = '0ad7b71a-f2be-4921-810d-4a67751b4cb5'
  AND (chunk_index BETWEEN 0 AND 7 OR chunk_index BETWEEN 117 AND 119);
