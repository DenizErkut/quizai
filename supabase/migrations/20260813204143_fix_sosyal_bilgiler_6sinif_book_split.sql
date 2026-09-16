-- "Evimiz Dünya" ve "Birlikte Yaşamak" birebir aynı kitabın (tam metin,
-- 3 gerçek öğrenme alanı) iki kopyasıydı. Önce "Birlikte Yaşamak"
-- kaynağının kendi mükerrer 135 chunk'ı tamamen siliniyor (c9491f2f'in
-- zaten analiz edilmiş chunk'ları kullanılacak).
DELETE FROM meb_chunks WHERE resource_id = '8848d935-60fa-4dde-a6c4-e650f1d6baf5';

-- c9491f2f'in chunk 3-28'i (gerçek "Birlikte Yaşamak" içeriği) doğru
-- kaynağa (8848d935) taşınıyor.
UPDATE meb_chunks
SET resource_id = '8848d935-60fa-4dde-a6c4-e650f1d6baf5', unit = 'Birlikte Yaşamak'
WHERE resource_id = 'c9491f2f-04d9-4f39-bef1-a1cf6bd05b4d' AND chunk_index BETWEEN 3 AND 28;

-- c9491f2f'in chunk 75-134'ü (gerçek "Ortak Mirasımız" içeriği) mevcut
-- ince "Ortak Mirasımız" kaynağına taşınıyor (o kaynağın eski ince
-- içeriği raw_text güncellemesiyle zaten değişecek).
UPDATE meb_chunks
SET resource_id = '569a17c2-c8df-447c-ab14-411f86d06a92', unit = 'Ortak Mirasımız'
WHERE resource_id = 'c9491f2f-04d9-4f39-bef1-a1cf6bd05b4d' AND chunk_index BETWEEN 75 AND 134;

-- c9491f2f'de sadece chunk 29-74 (gerçek "Evimiz Dünya") kalıyor.
-- Ön sayfa (0-2) siliniyor.
DELETE FROM meb_chunks
WHERE resource_id = 'c9491f2f-04d9-4f39-bef1-a1cf6bd05b4d' AND chunk_index NOT BETWEEN 29 AND 74;
