UPDATE error_reports
SET status = 'confirmed',
    admin_note = 'Kök neden bulundu ve düzeltildi (13 Ağustos 2026): büyük sayılarda basamak sayarken AI kayma hatası yapıyordu, doğrulama katmanı bu soru kalıbını "matematik" olarak tanımadığı için bağımsız kontrole gitmiyordu. Kod ile deterministik basamak kontrolü eklendi.'
WHERE id IN ('037c21c6-3ce5-40b3-91d2-b639c4e6f3ad', 'fe8f6220-20b1-485a-b4dd-ccda28610042');

UPDATE error_reports
SET status = 'rejected',
    admin_note = 'İncelendi: bu soru aslında doğru cevap anahtarına sahip (kayıtlı doğru = öğrencinin cevabı). Muhtemelen yanlışlıkla bildirilmiş.'
WHERE id IN ('bab764fe-4704-454f-a94f-01d602d07be0', 'f30ddb36-0cc6-4a05-90aa-5363d0bb23d9');
