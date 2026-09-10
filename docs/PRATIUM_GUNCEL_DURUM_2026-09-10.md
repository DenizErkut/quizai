# Pratium Güncel Geliştirme Durumu

Son güncelleme: 10 Eylül 2026

## Tamamlanan ve canlıya gönderilenler

- [x] Learning Event temeli, mastery/retention kalibrasyonu ve tarihsel backfill.
- [x] Konu/ders normalizasyonu, alias sözlüğü ve kanonik Learning Graph bağlantıları.
- [x] Kazanım importu, sürümleme, yaşam döngüsü ve soru → kazanım eşleştirme.
- [x] Recommendation Engine v2 yaşam döngüsü ve bağlamsal önceliklendirme.
- [x] Adaptive Learning v3 için soru-bazlı güvenlik sınırları.
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
- [x] Supabase migration’ları production projesine uygulandı ve doğrulandı.

## Açık veya kısmen tamamlanan maddeler

### Katalog ve içerik

- [ ] Eksik üniteler, çok-sınıflı konu adayları ve bekleyen uzman eşleştirmeleri tamamlanacak.
- [ ] Gerçek ön koşul paketleri ve doğrulanmış misconception mikro içerikleri uzmanlarca doldurulacak.

### AI Tutor ve ajanlar

- [ ] Ajanlar için gerçek tenant fixture’larıyla iki-tenant erişim testleri.
- [ ] İçerik, tekrar ve ilerleme ajanlarının kullanıcı arayüzlerine bağlanması.
- [ ] Ajan kalite metrikleri için sürekli alarm/notification entegrasyonu.
- [ ] Öğretmen onayı gerektiren ajan işlemleri için görev kuyruğu.

### KVKK ve operasyon

- [ ] `data_lifecycle_requests` için admin doğrulama ve durum geçiş ekranı.
- [ ] Silme öncesi etki önizlemesi ve onaylı operatör workflow’u.
- [ ] Veri saklama sürelerinin tenant/ürün politikalarına göre yapılandırılması.
- [ ] Gerçek üretim yedekleme, geri yükleme ve periyodik kurtarma tatbikatı.

### Öğrenme etkisi

- [ ] Adaptif ve standart grupların öğrenme kazanımı karşılaştırması.
- [ ] Unutma, sınav performansı ve öğrenme tıkanması tahminlerinin kalibrasyonu.
- [ ] Recommendation ve Tutor politikalarının A/B veya gölge testleri.

## Son commitler

- `4c2b5f6` — KVKK veri yaşam döngüsü talep kaydı.
- `04008ac` — Ajan kalite alarm çıktıları.
- `0372268` — Ajan operasyon runbook’u.
- `71ea0ee` — Tenant izolasyonu güvenlik testleri.
- `1dbc276` — Ajan karar audit kaydı.

## Not

Production dağıtımı GitHub `main` dalı üzerinden otomatik yapılmaktadır. Supabase migration’ları ayrıca production projesinde uygulanıp migration listesi ve güvenlik advisor sonuçlarıyla doğrulanmıştır.
