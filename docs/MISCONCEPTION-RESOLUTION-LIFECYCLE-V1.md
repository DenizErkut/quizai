# Misconception Resolution Lifecycle v1

Doğrulanmış bir kavram yanılgısı, tek bir doğru cevapla kapatılmaz. Yanılgının son yanlış kanıtından sonra farklı iki test oturumunda doğru karşı kanıt oluştuğunda öğrenci durumu `resolved` olur.

- Karşı kanıt yalnız doğru cevaplardan ve sorunun doğrulanabilir çeldirici metadata'sından üretilir.
- Yalnız uzman tarafından `verified` edilmiş katalog kayıtları çözümlenebilir.
- Aynı oturumdaki tekrarlar tek oturum kanıtı sayılır.
- Çözüm tarihinden sonra yeni yanlış kanıt gelirse durum tekrar `confirmed` olur.
- Ham Learning Event kayıtları değiştirilmez.
- Öğrenci profilindeki bilinen yanılgılar listesi yalnız aktif, doğrulanmış durumlarla yeniden oluşturulur.

Yayın sırası: `scripts/047_misconception_resolution_lifecycle_v1.sql`, ardından uygulama commit'i.
