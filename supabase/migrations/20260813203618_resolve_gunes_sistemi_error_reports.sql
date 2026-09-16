UPDATE error_reports
SET status = 'confirmed',
    admin_note = 'Kök neden bulundu ve düzeltildi (13 Ağustos 2026): bu kaynak aslında tüm kitabı (4 ünite) içeriyordu, hepsi yanlışlıkla "1. Ünite" etiketiyle kayıtlıydı. Chunk''lar doğru ünitelere (2. Ünite: Kuvvet, 3. Ünite: Canlılarda Sistemler, 4. Ünite: Işık) taşındı, ön sayfa/kaynakça/harita eki silindi.'
WHERE status = 'pending' AND topic ILIKE '%güneş sistemi%';
