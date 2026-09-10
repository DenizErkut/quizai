# Pratium Uzman İçerik Teslim Paketi

Son güncelleme: 10 Eylül 2026

Bu belge, kodla güvenli biçimde tamamlanamayan ve gerçek MEB kaynağı ya da alan uzmanı kararı gerektiren kalan işleri tanımlar. Amaç, yapay veri üretmeden uzman girdisini tekrarlanabilir ve denetlenebilir biçimde canlı sisteme almaktır.

## 1. Katalog adayları

Admin → Müfredat Yönetimi → Kanonik Konu–Ünite İnceleme Kuyruğu ekranında filtre seçilip **Uzman CSV'si indir** düğmesi kullanılmalıdır. Dışa aktarım yalnızca toplulaştırılmış konu, ders, sınıf, kullanım ve öncelik verilerini içerir; öğrenci kimliği içermez.

Her satır için uzman şu kararlardan birini vermelidir:

- Doğrulanmış MEB ünitesine bağla ve kanonik konu adını onayla.
- Ders bilgisi eksikse doğru dersi belirle.
- Çok sınıflı başlığı sınıf bazında ayrı kanonik hedeflere ayır.
- Serbest metin, K12 dışı veya gürültü ise gerekçesiyle katalog dışında bırak.

Kabul kapısı:

- Kaynak URL/belge ve müfredat yılı kayıtlıdır.
- Ders, sınıf, ünite ve konu zinciri tek anlamlıdır.
- Aynı kanonik hedefe bağlanan aliaslar kontrol edilmiştir.
- Kullanılmış bir eşleştirme geriye silinmez; ileri düzeltme olarak yeni karar yayımlanır.

## 2. Resmî kazanım kataloğu

5. sınıf Matematik dışındaki paketler için mevcut kontrollü import formatı kullanılmalıdır. Her kazanımda kod, resmî açıklama, ders, sınıf, müfredat sürümü ve kaynak zorunludur.

Kabul kapısı:

- `objective → topic → unit → subject` zinciri eksiksizdir.
- Hedef müfredat sürümü taslakta doğrulanmış, sonra yayımlanmıştır.
- Kod ve açıklama resmî kaynakla satır bazında karşılaştırılmıştır.
- Çakışan veya emekliye ayrılmış kazanımlar yaşam döngüsü kararıyla işlenmiştir.

## 3. Ön koşul paketleri

Ön koşullar ders ve sınıf bazında küçük paketler halinde hazırlanmalıdır. Bir ilişki yalnızca pedagojik gerekçesi, kaynak türü ve güven düzeyi ile önerilebilir.

Kabul kapısı:

- Döngü, kopuk düğüm ve hatalı sınıf geçişi kalite kontrolleri geçmiştir.
- AI önerisi uzman tarafından onaylanmıştır.
- Ön koşul, öğrenciyi daha ileri sınıf içeriğine zorlamaz.
- Yayın sürümü ve onaylayan uzman denetim geçmişinde görünürdür.

## 4. Yanılgı mikro içerikleri

Yalnızca doğrulanmış yanılgılar için kısa açıklama, düzeltme stratejisi, çözümlü örnek ve kontrol sorusu hazırlanmalıdır. AI çıktısı taslaktır; uzman onayı olmadan öğrenciye sunulmaz.

Kabul kapısı:

- Açıklama öğrenciyi etiketlemez ve yaş düzeyine uygundur.
- Çözümlü örnek tek ve açık bir kavramsal düzeltme yapar.
- Kontrol sorusu cevabı soru kökünde veya ipucunda açığa çıkarmaz.
- İçerik sürümü, onaylayan uzman ve karar gerekçesi kayıtlıdır.

## Tamamlanma kanıtı

Bu dört operasyon ancak admin ekranındaki bekleyen sayaçları hedef kapsam için sıfıra indiğinde, yayın denetim geçmişi oluştuğunda ve yeni testlerde kanonik eşleşme/Graph kapsamı ölçümleri hedef eşiği geçtiğinde tamamlanmış sayılır. Sadece CSV hazırlanması veya AI taslağı üretilmesi içerik işini tamamlamaz.
