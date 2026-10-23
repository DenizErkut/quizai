# Öğretmen paneli: Bulgudan eyleme

23 Ekim 2026. Başlangıç sürümü: `eb1433d` (`origin/main`). Çalışma dalı: `codex/teacher-evidence-action`.

## Kullanım

Öğretmen ana panelinin üstündeki **Bulgudan eyleme** bölümü mevcut ajan önerilerini gösterir. Bekleyen, onaylanan, reddedilen ve tüm kayıtlar arasında geçiş yapılabilir. Son 100 kayıt sınırı açıkça belirtilir; bu bir tam tarihçe dışa aktarımı değildir.

Her kartta bulgu/gerekçe, kaydedilmiş sayısal kanıt, belirsizlik açıklaması, önerilen işlem, öğretmen kararı ve uygulama/sonuç takibi vardır. Öğrenci ve sınıf adları mevcut panelin yetkili listesinden gelir. Kanıt bulunmadığında güven yüzdesi veya teşhis uydurulmaz.

1. Kanıtı ve çalışma planını açın; mevcut öğrenci–kazanım kanıt zincirini inceleyin.
2. 10–500 karakterlik karar gerekçesi / öğretmen plan notu girin.
3. Onaylayın veya reddedin. Bu adım öğrenciye test atamaz, mesaj göndermez, geçmiş puanları değiştirmez.
4. **Onaylananlar** görünümünden geçerli kazanım kimliği bulunan çalışma/plan önerisini açın. Mevcut doğrulanmış öğrenme planı bileşeni üzerinden **Öğrenciye ata** ile ayrıca atama yapın. Mevcut soru kalite, zorluk ve görülmemiş soru koşulları korunur.
5. Atanan döngü önerinin takibine açıkça bağlanır. Bağlama başarısız olursa gerçek atama görünür kalır; **Bu döngüyü takibe bağla** ile test atamasını tekrarlamadan yeniden deneyin.

Plan notu karar gerekçesi olarak saklanır; test içeriğini otomatik yeniden yazmaz. Mesaj önerileri bu ekrandan otomatik gönderilmez. Yeni öneri üreten bir model/ajan eklenmedi; mevcut öneri kuyruğunun incelenmesi ve uygulanabilir takibe bağlanması geliştirildi. Boş kuyruk doluymuş gibi örnek öğrenci verisi gösterilmez.

## Durumların anlamı

| Durum | Gerçek kayıt |
|---|---|
| Karar bekliyor | Kuyrukta bekleyen öneri |
| Onaylandı | Öğretmen kararı; uygulama değil |
| Atandı | Öğretmenin açıkça bağladığı gerçek ölçüm döngüsü |
| Ön test kaydedildi | Aynı döngüde tamamlanmış başlangıç ölçümü |
| Aktarım ölçüldü | Aktarım testi var; öğretmen incelemesi henüz doğrulanmamış |
| Öğretmen incelemeli aktarım mevcut | Mevcut `verifiedLearningMetrics` koşullarını sağlayan sonuç |

“Aktarım mevcut” her zaman %80 ürün eşiği aşıldı demek değildir. Ölçüm bileşeni gerçek puanı ve durumunu ayrı gösterir. Ön/son farkı nedensel müdahale etkisi olarak sunulmaz. Benzer konu, aynı öğrenci veya eskiden tamamlanmış bir test tek başına önerinin uygulandığının kanıtı değildir.

## Güvenlik ve kayıt

- GET/PATCH/POST için sunucu doğrulamalı oturum ve onaylı öğretmen gerekir.
- GET güncel sınıf sahipliği ve öğrenci üyeliğini kontrol eder; eski üyeye ait kuyruk kaydı gösterilmez.
- Karar yazımı öğretmen ve `pending` durumu üzerinden koşulludur; ikinci karar 409 döner.
- Takip bağlantısı için onay sonrası oluşturulmuş, aynı öğretmen/öğrenci/sınıf/kazanıma ait döngü gerekir. Mesaj önerisi bir ölçüm döngüsüyle “uygulandı” sayılmaz.
- Bağlantılar `agent_decision_audit` tablosunda `teacher-evidence-action-link-v1` politikasıyla kaydedilir. Aynı bağlantının sıradan yeniden denemesi yeni kayıt oluşturmaz.
- Sonuçlar mevcut öğrenme kayıtlarından yüklenir. Okuma hatası boş/başarılı durum gibi gizlenmez. Yanıtlar `private, no-store` döner.
- Yeni tablo, migrasyon, ücretli AI çağrısı veya üretim verisi üzerinde bu geliştirme sırasında değişiklik yoktur.

## Doğrulama

- TypeScript `--noEmit`: geçti.
- Değişen bileşenler, API ve yardımcılar için ESLint: geçti.
- Birim testleri: 330/330 geçti. Gerçek route handler kodu sahte veri katmanıyla da çalıştırıldı: oturumsuz/onaysız erişim, eski üyelik, koşullu karar, kapsam dışı döngü, açık bağlantı ve tekrar denemesi.
- Odaklı Chromium testleri: 3/3 geçti. Türkçe onay–ayrı atama akışı, bağlantı hatasından çift atama olmadan kurtarma, atandı/öğrenme doğrulandı ayrımı, İngilizce mobil görünüm ve hata sunumu.
- TR/EN ve mevcut DE/FR/ES/AR sözlükleri için yeni ekran metinleri eklendi.

Testler yerel ve sentetik verilerle yapıldı; gerçek öğretmen oturumuyla üretim E2E veya canlı dağıtım yapılmadı. Tam üretim derlemesi bu doğrulama listesine dahil değildir. Paket kilidi değiştirilmedi; bağımlılık kurulumu mevcut kilitte 7 güvenlik bildirimi raporladı (5 yüksek, 2 kritik). Bu çalışma kapsamında otomatik bağımlılık yükseltmesi yapılmadı; ayrı incelenmelidir.

## Yayına hazırlık

Kod incelemesi ve dağıtımdan sonra gerçek bir öğretmen hesabıyla kendi sınıfında bekleyen/onaylı öneri, hazır soru stoğu olmayan kazanım ve gerçek gecikmeli ölçüm senaryoları kontrol edilmelidir. Veritabanı migrasyonu gerektirmez. Üretimde test amacıyla öğrenci puanı veya sahte öğrenme kanıtı yazılmamalıdır.
