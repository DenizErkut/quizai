-- "7. Ünite: Sürdürülebilir Yaşam ve Etkileşim" kaynağının eski ince
-- (2105 karakter) chunk'ları siliniyor, yerine zengin içerik gelecek.
DELETE FROM meb_chunks WHERE resource_id = '7b11b42c-9442-4052-aa99-3ab74161e71a';

-- Unit 7 (chunk 60-80) doğru kaynağa taşınıyor
UPDATE meb_chunks SET resource_id = '7b11b42c-9442-4052-aa99-3ab74161e71a', unit = '7. Ünite: Sürdürülebilir Yaşam ve Etkileşim'
WHERE resource_id = '5f7bd147-6e48-4142-bcf4-2240027f32a6' AND chunk_index BETWEEN 60 AND 80;

-- 5f7bd147'de sadece Unit 6 (Elektriğin İletimi, chunk 4-59) kalıyor;
-- ön sayfa (0-3) siliniyor
DELETE FROM meb_chunks
WHERE resource_id = '5f7bd147-6e48-4142-bcf4-2240027f32a6' AND chunk_index NOT BETWEEN 4 AND 59;
