-- ÖNEMLİ: Bu migration, önceki bir adımda (Gençliğe Hitabesi silme)
-- YAPILAN BİR HATAYI kısmen telafi ediyor. chunk_index=0 dikkatli
-- incelenmeden silinmişti, ve o chunk'ın aslında "Yer Kabuğu ve
-- Dünya'mızın Hareketleri" ünitesinin GERÇEK içeriğinin bir kısmını da
-- taşıdığı sonradan anlaşıldı. O içerik artık kurtarılamaz. Bu migration
-- kalan chunk'lardan KURTARILABİLİR olanı doğru şekilde ayırıyor,
-- KURTARILAMAYANI ise açıkça "içerik kayıp" olarak işaretliyor.

-- 1) "Besinlerimiz" ve "Kuvvetin Etkileri" kaynaklarının kendi mükerrer
-- kopya chunk'ları siliniyor (d2f5cd32'nin zaten analiz edilmiş
-- chunk'ları kullanılacak).
DELETE FROM meb_chunks WHERE resource_id = '0f1f3392-fa6b-425a-9209-3fb188ac74bb';
DELETE FROM meb_chunks WHERE resource_id = '5f3875c7-ca3b-4719-ac20-ce8feadc9644';

-- 2) Gerçek "Besinlerimiz" içeriği (chunk 1-7) doğru kaynağa taşınıyor.
UPDATE meb_chunks SET resource_id = '0f1f3392-fa6b-425a-9209-3fb188ac74bb', unit = 'Besinlerimiz'
WHERE resource_id = 'd2f5cd32-7564-461e-b773-f6dce5d21662' AND chunk_index BETWEEN 1 AND 7;

-- 3) Kaynakça/görsel kaynakça/referans kodları (chunk 16-21) -- içerik
-- değil, siliniyor.
DELETE FROM meb_chunks
WHERE resource_id = 'd2f5cd32-7564-461e-b773-f6dce5d21662' AND chunk_index BETWEEN 16 AND 21;

-- 4) Kalan chunk 8-15 (ışık kirliliği, ses kirliliği, aydınlatma/ses
-- teknolojileri) -- GERÇEK ünite adı KESİN DEĞİL, en iyi tahminle
-- etiketlendi, admin_note'ta belirsizlik açıkça not edildi.
UPDATE meb_resources
SET unit = 'Aydınlatma ve Ses Teknolojileri (TAHMİNİ AD -- doğrulanmalı)',
    title = '4. Sınıf - Fen Bilimleri (ünite adı belirsiz)'
WHERE id = 'd2f5cd32-7564-461e-b773-f6dce5d21662';

-- 5) "Kuvvetin Etkileri" kaynağının artık hiç chunk'ı yok (gerçek
-- içeriği silinen chunk 0'daydı, kurtarılamadı). raw_text'i dürüstçe
-- "içerik kayıp" olarak işaretliyoruz -- meb-search boş/yanıltıcı bir
-- şeyle çalışmasın.
UPDATE meb_resources
SET raw_text = '[İÇERİK KAYIP -- yeniden yüklenmeli. Bkz. admin_note.]'
WHERE id = '5f3875c7-ca3b-4719-ac20-ce8feadc9644';
