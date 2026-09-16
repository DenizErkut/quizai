UPDATE error_reports
SET status = 'confirmed',
    admin_note = 'Kok neden bulundu ve duzeltildi (17 Agustos 2026): "subject" (ders) parametresi frontend gonderiyordu ama backend hic okumuyordu -- AI dersin Ingilizce oldugunu sadece konu adindan cikarsamak zorunda kaliyor, "Soru dili: Turkce" talimati onu konu disina (Turkce okuma-anlama sorularina) surukluyordu. subject artik backend''e, meb-search''e ve prompt''a acikca gecirilyor + yabanci dil dersleri icin ozel kural eklendi.'
WHERE id = '9646cff1-6bc6-4feb-97d7-3250b4dd9272';
