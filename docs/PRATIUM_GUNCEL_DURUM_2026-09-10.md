# Pratium Güncel Geliştirme Durumu

Son güncelleme: 10 Eylül 2026

## Tamamlanan ve canlıya gönderilenler

- [x] Learning Event temeli, mastery/retention kalibrasyonu ve tarihsel backfill.
- [x] Konu/ders normalizasyonu, alias sözlüğü ve kanonik Learning Graph bağlantıları.
- [x] Kazanım importu, sürümleme, yaşam döngüsü ve soru → kazanım eşleştirme.
- [x] Recommendation Engine v2 yaşam döngüsü ve bağlamsal önceliklendirme.
- [x] Adaptive Learning v3 için soru-bazlı zorluk, soru tipi, destek ve güvenlik sınırları; cevap başına Learning Event/mastery projection.
- [x] Öğrenci, öğretmen, veli ve kurum öğrenme özetleri.
- [x] Öğrenci ana ekranında öneri yaşam döngüsü: uygula, ertele, reddet, tamamla.
- [x] AI Tutor’un mastery, kanonik kazanım ve aktif öneri bağlamına bağlanması.
- [x] Tutor yaş/seviye uyarlaması, kademeli ipucu ve öğretmen onayı sınırı.
- [x] Salt-okunur çalışma planı, onaylı tekrar ve ilerleme ajanları.
- [x] Ajan karar audit kaydı; ham AI çıktısı tutulmuyor.
- [x] Ajan kalite API’si, admin paneli ve alarm eşikleri.
- [x] Tenant izolasyonu için kimliksiz/sahte token güvenlik testleri.
- [x] Migration geri alma, veri kurtarma, ajan operasyon ve KVKK runbook’ları.
- [x] KVKK veri yaşam döngüsü talep kayıt tablosu; istemci erişimi kapalı.
- [ ] Supabase migration’larının production projesine uygulanması ve uzak migration listesiyle doğrulanması. *(Kod ve tekrarlanabilir migration’lar `main` dalında; mevcut çalışma kanıtı canlı DB uygulamasını göstermiyor.)*

## Açık veya kısmen tamamlanan maddeler

### Katalog ve içerik

- [ ] Eksik üniteler, çok-sınıflı konu adayları ve bekleyen uzman eşleştirmeleri tamamlanacak.
- [ ] Gerçek ön koşul paketleri ve doğrulanmış misconception mikro içerikleri uzmanlarca doldurulacak.

### AI Tutor ve ajanlar

- [ ] Ajanlar için gerçek tenant fixture’larıyla iki-tenant erişim testleri.
- [x] İçerik, tekrar ve ilerleme ajanlarının kullanıcı arayüzlerine bağlanması.
- [x] Ajan kalite metrikleri için sürekli alarm/notification entegrasyonu. *(Cron alarmı ve admin kalite görünümü.)*
- [x] Öğretmen onayı gerektiren ajan işlemleri için görev kuyruğu.

### KVKK ve operasyon

- [x] `data_lifecycle_requests` için admin doğrulama ve durum geçiş ekranı.
- [x] Silme öncesi etki önizlemesi ve onaylı operatör workflow’u.
- [ ] Veri saklama sürelerinin tenant/ürün politikalarına göre yapılandırılması.
- [ ] Gerçek üretim yedekleme, geri yükleme ve periyodik kurtarma tatbikatı.

### Öğrenme etkisi

- [x] Adaptif ve standart grupların öğrenme kazanımı karşılaştırması.
- [x] Unutma, beklenen başarı ve öğrenme tıkanması tahminleri; 14 günlük gerçek sonuç kalibrasyonu.
- [x] Recommendation ve Tutor politikalarının A/B veya gölge testleri.

## Son commitler

- `d5b7109` — Adaptif cevapta Learning Event ve anlık mastery projection.
- `6d6e196` — Uzman/MEB içerik teslim paketi ve katalog CSV dışa aktarımı.
- `971766b` — Adaptif soru desteği, ipucu ve sunum politikası.
- `1d75e1c` — Yol haritası durum denetimi.

## Not

GitHub `main` dalı günceldir. Hosting’in otomatik dağıtım ayarı ve production Supabase migration durumu bu çalışma alanından bağımsızdır; canlı uygulama/migration doğrulaması yapılmadan “canlıya alındı” kabul edilmemelidir.
