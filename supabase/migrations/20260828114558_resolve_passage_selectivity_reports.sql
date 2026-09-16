UPDATE error_reports
SET status = 'confirmed',
    admin_note = 'Kok neden bulundu ve duzeltildi (28 Agustos 2026): ayni kaynak metin (passage) pasaja HIC dayanmayan genel bilgi sorularina da (bu ornekte: tevhid kavrami) korlemesine gosteriliyordu. Artik her soru icin kelime-duzeyinde ortusme kontrolu yapiliyor (questionReferencesPassage) -- pasajla en az 2 anlamli kelime ortusmuyorsa passage o soruya eklenmiyor. Gercek 6 soruyla (3u pasaja dayali, 3u genel bilgi) test edildi, 6/6 dogru siniflandi. Ayni oturumda soru sayisi tamamlama (topup) mekanizmasi da tek turdan 2 tura cikarildi (10 istenip 6-8 gelme sorunu icin).'
WHERE id IN ('96b6fa5e-767b-4d53-ab42-f10d916e41d1', '5ead8be4-a58a-4217-b645-f3dbf8175dd9', '50e83c60-6ae4-4db7-bc16-b7af8e1e67c3');
