# Curriculum Versioning & Objective Lifecycle v1

Tarih: 8 Eylül 2026
Durum: Yerel olarak tamamlandı ve geri alınan canlı şema testiyle doğrulandı; kalıcı canlı migrasyon henüz uygulanmadı.

## Amaç

Kazanım kimliğini test ve Learning Event geçmişi boyunca sabit tutarken müfredat yılları arasındaki içerik değişikliklerini ayrı, değiştirilemez revizyonlar olarak saklamak. Böylece eski testler kendi dönemindeki kazanım kanıtını korur; yeni test üretimi yalnızca aktif ve doğrulanmış müfredat sürümünü kullanır.

## Eklenen yapı

- `curriculum_versions`: MEB müfredat sürümlerini `draft → active → retired` yaşam döngüsüyle tutar. Aynı kurum için yalnızca bir aktif sürüme izin verir.
- `learning_objective_revisions`: Sabit kazanım kimliğinin müfredata özel, değiştirilemez içerik anlık görüntülerini tutar.
- `learning_objective_lifecycle_audit`: Oluşturma, revizyon, emekliye ayırma, yerine başka kazanım koyma ve yeniden etkinleştirme işlemlerini gerekçesi ve önce/sonra durumuyla kaydeder.
- Kazanım kataloğuna aktif müfredat, mevcut revizyon, geçerlilik tarihleri, yaşam döngüsü ve yerine geçen kazanım bağları eklendi.
- Import partileri bir müfredat sürümüne bağlandı. Taslak sürümde yayımlanan kazanımlar, sürüm etkinleşene kadar öğrenci akışlarına açılmaz.
- Quiz oturumuna `curriculum_version_id`; Learning Event metadata'sına hem müfredat hem kazanım revizyon kimliği eklendi.

## Güvenlik kuralları

- Yeni sürüm etkinleştirilirken mevcut her aktif kazanım için hedef sürümde hazırlanmış bir revizyon aranır. Eksik varsa etkinleştirme tümüyle reddedilir.
- Emekliye ayrılan veya yerine başka kazanım konan kayıt silinmez; yalnızca yeni üretimden çıkarılır.
- Yeni soru üretiminde katalog, aktif müfredat sürümü + aktif yaşam döngüsü + doğrulanmış kazanım koşullarının tümünü uygular.
- Yönetim tabloları ve mutasyon fonksiyonları yalnızca sunucu servis rolüne açıktır.
- Learning Graph düğüm ve bağlantıları yaşam döngüsüyle birlikte etkinleştirilir veya pasifleştirilir.

## Yönetim ekranı

Admin müfredat alanına şu işlemler eklendi:

- Yeni müfredatı taslak olarak oluşturma
- Import sırasında hedef müfredat sürümünü seçme
- Mevcut kazanımın yeni müfredat revizyonunu hazırlama
- Hazırlığı tamamlanmış sürümü kontrollü etkinleştirme
- Kazanımı gerekçeli biçimde emekliye ayırma veya yeniden etkinleştirme

API seviyesinde `supersede` işlemi ve yerine geçen kazanım bağı da hazırdır. Yanlış eşleştirme riskini azaltmak için ilk arayüz sürümünde bu işlem doğrudan buton olarak sunulmamıştır.

## Dağıtım sırası

1. `scripts/032_curriculum_versioning_objective_lifecycle_v1.sql` migrasyonunu uygula.
2. Şema, RLS/izin ve fonksiyon güvenlik kontrollerini çalıştır.
3. Uygulama kodunu yayımla.
4. Admin ekranında aktif `MEB-2026-2027` sürümünü, mevcut `MAT.5.1.1` revizyon backfill'ini ve import sürüm seçimini doğrula.
5. Yeni bir testte quiz session ve Learning Event metadata sürüm kimliklerini doğrula.

Uygulama kodu migrasyondan önce yayımlanmamalıdır; yeni API uçları migrasyonla gelen tablo ve fonksiyonları bekler.

## Migrasyon ve geri alma riskleri

- Migrasyon eklemelidir ve mevcut Learning Event satırlarını yeniden yazmaz.
- Mevcut katalog kayıtları aktif `MEB-2026-2027` sürümüne birinci revizyon olarak backfill edilir.
- Sürüm etkinleştirme tek işlem içindedir; hazırlık eksikse hiçbir durum değişmez.
- Migrasyon sonrasında yeni testler revizyon kimliği yazmaya başlayacağı için şemayı tamamen geri almak yerine uygulama kodunu geri almak ve yeni yönetim işlemlerini durdurmak tercih edilmelidir.
- `curriculum_versions` veya revizyon tablolarının sonradan silinmesi, yeni quiz ve event kayıtlarının referans bütünlüğünü bozabilir.

## Doğrulama sonucu

- Değiştirilen TypeScript dosyalarında hedefli lint: başarılı.
- TypeScript `--noEmit`: başarılı.
- Next.js derleme ve TypeScript aşaması: başarılı; sayfa verisi toplama aşaması yerel ortamda Supabase URL değişkeni bulunmadığı için durdu.
- Canlı Supabase üzerinde `BEGIN → migration → import → publish → draft revision → version activation → retire → reactivate → ROLLBACK`: başarılı.
- Test sonrasında migrasyon nesnelerinin ve geçici test kazanımının canlıda bulunmadığı ayrıca doğrulandı.
