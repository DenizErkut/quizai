# Kitapçık görselleri

Canlı inceleme: 548 teacher_booklet_exact/ai_booklet_exact soruda SVG yok. PDF metin çıkarımı raster veya vektör şekilleri taşımıyordu. Metin içinde şekil referansı bulunmaması bir sorunun görselsiz olduğunun kanıtı değildir.

## Kullanım

Soru Kitapçıkları → onaylı öğretmen/AI kitapçığı → Soru görsellerini yönet → soruyu seç → kaynak PDF'teki ilgili şekli PNG/JPEG olarak yükle → metin, seçenek ve kayıtlı cevabı incele → Görseli onayla ve soruya bağla.

Görsel 2 MB/12 megapiksel ile sınırlıdır. Raster görüntü güvenli SVG image bağlamında saklanır; öğrenci ekranındaki mevcut SVG yolu bunu gösterir. Orijinal PDF değiştirilmez. Görsel soru kaydında tutulur, yeni kullanımlara taşınır. Eski test ve kilitli benchmark anlık görüntüleri değiştirilmez.

Yeni metin çıkarımında şekil gereksinimi saptanan sorular pending durumunda saklanır; görsel incelemesi olmadan onaylı öğrenci havuzuna dahil edilmez. Model tespiti her şekli garanti etmez; kaynakla insan karşılaştırması gereklidir. Görsel onayı AI kalite onayı veya kazanım onayı olarak etiketlenmez.

## Sınır

Bu sürüm otomatik PDF sayfa rasterleme/kırpma/soru-şekil ilişkilendirmesi değildir. Kaynak PNG/JPEG kırpımı yönetici tarafından sağlanır. Mevcut metin odaklı Education Eval model çağrıları görsel model benchmark'ı sayılmaz; otomatik görsel değerlendirme ayrı çalışma gerektirir. Geçmişte düşmüş görseller bu değişiklikle kendiliğinden geri kazanılmaz.
