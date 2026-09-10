# Pratium Ajan ve Veri Operasyon Runbook v1

## Kapsam

Bu runbook; sınırlı yetkili ajanlar, Learning Event/Mastery verisi ve Supabase migration'ları için canlı operasyon adımlarını tanımlar.

## Günlük kontrol

1. Admin panelinde **Ajan kalite izleme** kartını aç.
2. Son 7 günde `empty decision rate` değerini kontrol et.
3. `%50` üzeri boş karar oranında ilgili ajanı incelemeye al ve yeni içerik yayınını durdur.
4. `agent_decision_audit` kayıtlarında politika sürümünün beklenen sürüm olduğunu doğrula.
5. Tenant izolasyonu E2E testlerini çalıştır.

## Alarm eşikleri

| Sinyal | Eşik | İlk aksiyon |
|---|---:|---|
| Boş ajan kararı | `%50` | Ajanı read-only inceleme modunda tut, logları incele |
| Sonuçsuz öneri planı | 3 ardışık çağrı | Recommendation RPC ve katalog kapsamını kontrol et |
| API 5xx | 5 dakikada 5 | Son deployment'ı durdur, Supabase advisor ve uygulama loglarını kontrol et |
| Yetkisiz erişim başarısı | 1 | İlgili rotayı hemen kapat, RLS ve bearer doğrulamasını incele |

## Migration prosedürü

1. Migration dosyasını `supabase/migrations/` altında immutable bırak.
2. Önce staging/branch üzerinde uygula.
3. Şema, RLS ve index doğrulaması yap.
4. Supabase migration listesinde sürümün göründüğünü kontrol et.
5. Ardından production'a uygula ve advisor güvenlik taraması çalıştır.

Migration geri alma için yeni bir ters migration yazılır; uygulanmış migration dosyası silinmez veya değiştirilmez.

## Veri kurtarma ve yeniden hesaplama

- Learning Event ham gerçekliktir; `student_mastery` yeniden hesaplanabilir türetilmiş veridir.
- Hatalı hesaplamada önce yazma akışı durdurulur, ardından etkilenen tarih/tenant kapsamı belirlenir.
- Yeniden hesaplama idempotent bir migration veya kontrollü job ile yapılır.
- Ajan audit kayıtları silinmez; olayın politika sürümü ve karar özeti korunur.

## KVKK ve çocuk verisi

- Ham AI çıktısı audit tablosuna yazılmaz.
- Ajanlar not, puan, profil, ödev veya müfredat değiştiremez.
- Veli/öğretmen/kurum erişimi yalnızca bağlı tenant kapsamındadır.
- Silme taleplerinde ilişkili türetilmiş özetler ve audit saklama politikası ayrıca değerlendirilir.
