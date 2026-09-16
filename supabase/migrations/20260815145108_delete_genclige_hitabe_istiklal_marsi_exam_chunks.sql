-- exam_chunks tablosunda 5 farklı sınav kitapçığının hepsinde AYNI ön
-- sayfa şablonu (chunk 2 = İstiklal Marşı, chunk 3 = Gençliğe Hitabesi)
-- tekrarlanıyordu. Her ikisinin de TAM içeriği doğrulandı -- ikisi de
-- SADECE bu metinlerden ibaret, gerçek sınav sorusu içeriğiyle
-- karışmamış (önceki chunk'ta yaşanan hatadan farklı olarak burada net,
-- temiz sınırlar var). Her kaynak 148-162 chunk içeriyor, 2 chunk
-- silmek güvenli.
DELETE FROM exam_chunks WHERE id IN (
  '77bb5038-fd60-488d-8b1a-9ee9b01c45f6', '07de31a3-aa1f-45d6-bc03-2dd2ecf51779',
  '5f811fb0-7401-4a28-a133-4ac8cf417ee6', 'c58a3513-4c49-4a15-bf0d-4c1e747d4343',
  'de88a26c-9f2f-46bf-bcd3-3c536f66d84f', '2a668be0-43ad-4b5e-91ae-a06e99e6d6fe',
  'e1ae3b3c-f2a4-4afc-8aa6-7911337b42d7', 'e274cb28-1fa0-4d82-bd46-5564ee94812e',
  '7e12d553-2d98-4b78-836c-484e4ac1a387', '7a309f67-6c09-452f-ba9c-48c0f46a189a'
);
