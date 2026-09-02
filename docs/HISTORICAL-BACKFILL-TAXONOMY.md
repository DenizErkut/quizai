# Aşama 0.5 — Historical Backfill & Taxonomy Normalization

Bu çalışma ana roadmap'teki `Sprint 0.4 — Backfill Strategy` maddesini
somutlaştırır ve Learning Data Standard'ın parçası hâline getirir.

## Güvenlik ve veri koruma

- `quiz_sessions`, sorular ve cevaplar değiştirilmez.
- Her tarihsel event `backfilled=true`, `backfill_version=v1` ve
  `original_topic` metadata'sıyla izlenebilir.
- Aynı oturum yeniden işlendiğinde benzersizlik kısıtı ikinci event üretmez.
- Backfill en fazla 1000 oturumluk sınırlı partilerle çalışır.
- Alias tablosu istemciye açılmaz; yalnızca servis rolü yönetebilir.
- Otomatik semantik birleştirme yapılmaz. Örneğin `Allah İnancı` ile
  `Allah İnancı ve Evren` ayrı konu olarak korunur.

## Yayın ve doğrulama sırası

1. Migration'ı uygula ve güvenlik/performance advisor sonuçlarını incele.
2. `select * from backfill_quiz_learning_events(25);` ile küçük pilot çalıştır.
3. Oturum-soru-event toplamlarını ve doğru/yanlış sayılarını karşılaştır.
4. Sorun yoksa kalan oturumları sınırlı partilerle aktar.
5. Mastery, profil ve öneri tablolarının yeniden üretildiğini doğrula.
6. Alias `candidate` kayıtlarını içerik editörünün incelemesine aç.

`scripts/020_normalize_existing_learning_dimensions.sql`, 019'dan önce
oluşmuş event ve misconception boyutlarını da aynı sözlükle bir defaya mahsus
kanonikleştirir. Değişen eski değerler event metadata'sında korunur ve tüm
türetilmiş öğrenci durumu yeniden hesaplanır.

## Geri alma yaklaşımı

Ham test verisine dokunulmadığı için türetilmiş backfill eventleri
`metadata->>'backfill_version' = 'v1'` filtresiyle kesin olarak tanımlanabilir.
Geri alma gerekiyorsa önce öneri/profil/mastery yeniden üretim planı hazırlanır;
canlıda kontrolsüz toplu silme yapılmaz.
