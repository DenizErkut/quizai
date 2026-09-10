# Veri Yaşam Döngüsü ve KVKK Kontrolleri v1

- Profil, test, Learning Event ve türetilmiş mastery verileri ayrı kapsamlar olarak değerlendirilir.
- Silme veya erişim talepleri doğrudan veri tabanından silinmez; önce `data_lifecycle_requests` kaydı açılır.
- Talep sahibi ve veri sahibi doğrulanmadan işlem başlatılmaz.
- Çocuk verilerinde veli/vası ve kurum yetkisi ayrıca doğrulanır.
- Ajan audit kayıtlarında ham AI çıktısı, soru metni veya gereksiz kişisel veri tutulmaz.
- Türetilmiş mastery/recommendation kayıtları silme işleminde kaynak Learning Event kayıtlarıyla birlikte değerlendirilir.
- Üretim silme işlemi yalnızca onaylı, geri dönüş planı ve işlem kaydı bulunan operatör akışıyla yapılır.
- Bu migration otomatik silme yapmaz; yanlış silme riskini önlemek için yalnızca denetlenebilir talep kaydı oluşturur.
