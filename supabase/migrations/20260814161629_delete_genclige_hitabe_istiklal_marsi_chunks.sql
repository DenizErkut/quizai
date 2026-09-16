-- Deniz'in isteği: veritabanından Gençliğe Hitabesi/İstiklal Marşı'nın
-- TAM METNİNİ içeren chunk'ları sil. Sadece bu metinlerin GERÇEK DİZE/
-- METİN içeriğini taşıyan chunk'lar silindi (ör. "1921'de İstiklal Marşı
-- kabul edildi" gibi meşru tarihsel bahisler KORUNDU — bunlar gerçek,
-- değerli müfredat içeriği, marşın kendisi değil).
DELETE FROM meb_chunks WHERE id IN (
  '7132b4b6-d764-48c8-98de-50c8bc9f55f4',  -- Yer Kabuğu ve Dünya'mızın Hareketleri
  '4571c48d-cc97-481f-a455-cf8ec3e0da17',  -- Besinlerimiz
  '0ffb0f6b-91e8-43e1-8949-4270096d160d',  -- Kuvvetin Etkileri
  'dbff4b75-2cce-4a23-be86-89511ddef572'   -- Toplumun Parçasıyım (hem Hitabe hem Marş)
);
