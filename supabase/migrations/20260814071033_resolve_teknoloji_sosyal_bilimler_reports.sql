UPDATE error_reports
SET status = 'confirmed',
    admin_note = 'Kök neden bulundu ve düzeltildi (14 Ağustos 2026): "metinde verilen istatistiklere göre" gibi farklı ifadelerle görünmeyen metne atıf yapan sorular -- önceki filtre bu ifade çeşitliliğini yakalamıyordu. Filtre genişletildi + prompt''a istatistik/veri sorularının kaynağı gömmesini zorunlu kılan yeni bir kural eklendi.'
WHERE id IN ('9d038f30-51f3-40de-8d45-edde92192481', '02ac3e86-d096-4f44-a783-73bd5d17e362', 'f16d9e75-c11b-42bf-86d7-133749c4ba50');
