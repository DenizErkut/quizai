# Recommendation Engine v2 — Yaşam Döngüsü

## Kapsam

Öğrenci önerilerinin yalnızca üretilmesini değil, öğrencinin verdiği kararların kalıcı olarak izlenmesini sağlar.

| Kullanıcı eylemi | Durum | Sonuç |
|---|---|---|
| Uygula | `accepted` | Öneri çalışma başlatılmış olarak korunur. |
| Yarına ertele | `deferred` | Öneri 24 saat saklanır; aynı öneri yeniden üretilmez. |
| İlgilenmiyorum | `dismissed` | Öneri aktif listeden çıkarılır. |
| Tamamladım | `completed` | Öneri tamamlanmış olarak kapanır. |
| Şimdi aç | `active` | Ertelenmiş öneri yeniden etkinleştirilir. |

Her değişiklik `recommendation_lifecycle_events` tablosunda önceki/yeni durum, zaman, aktör ve gerekçeyle denetlenebilir biçimde saklanır. İstemci bu tabloya veya öneri kayıtlarına doğrudan yazamaz; oturumu doğrulayan sunucu uç noktası doğrulanmış geçiş fonksiyonunu çağırır.

## Yenileme davranışı

- Aktif öneriler motor çalıştığında güncellenebilir.
- Uygulanmış öneriler yeni hesaplamada korunur.
- Erteleme süresi devam eden öneriler korunur ve eşdeğer öneri tekrar gösterilmez.
- Erteleme süresi biten öneri kapanır; güncel öğrenci verisi hâlâ gerektiriyorsa motor yeni öneri üretir.
- Reddedilmiş ve tamamlanmış kayıtlar tarihçe olarak kalır.

## Geri alma

Migrasyon eklemelidir ve mevcut kayıtları silmez. Uygulama geri alınırsa yeni arayüz kaldırılabilir; yeni durum ve olay kayıtlarının korunması önerilir. Veritabanı geri alımı gerekiyorsa önce `accepted` ve `deferred` kayıtlar iş kuralına göre `active` veya `superseded` durumuna taşınmalıdır.

## İzlenecek metrikler

- Öneri kabul oranı
- Erteleme ve ertelemeden geri dönüş oranı
- Reddetme oranı
- Tamamlama oranı ve tamamlama süresi
- Kabul sonrası test sonucu/mastery değişimi
