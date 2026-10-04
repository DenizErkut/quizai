# 4 Ekim 2026: bakım ve öğrenme ölçümü

## Makalenin ürün açısından değerlendirilmesi

Makalenin uygulanabilir önerisi, içerik üretiminden ölçülebilir yardımsız öğrenmeye geçiştir. Kaynak referans numaraları kullanılabilir makale bağlantıları içermiyor. Reuters yatırım tahminleri, Apple izin değişiklikleri ve Stanford kullanım süreleri bu çalışma kapsamında doğrulanmış haber bulgusu olarak kullanılmadı.

%86 son test ve %78 gecikmeli aktarım örneğinde bu sayılar ayrı gözlemlerdir. %78, öğretmen tarafından incelenmiş aktarım başarısı olabilir; tek başına kazanım olasılığı ya da AI'ın nedensel etkisi değildir.

## Uygulananlar

- SheetJS 0.20.3 resmî arşivi sabitlendi; XLSX/XLS/CSV uyumluluk testleri eklendi. Üretim npm güvenlik taramasında sıfır uyarı.
- Canlı veritabanındaki 26 eksik yabancı anahtar indeksi eklendi.
- Tekrarlayan erişim politikaları aynı izin koşulları korunarak birleştirildi. Advisor'daki 104 tekrar sıfıra indirildi.
- Öğrenci ve öğretmen pilot ekranlarına öğretmen incelemeli yardımsız aktarım puanı ve gerçek ipucu sayısı eklendi.
- Birim Ekonomisi ekranına son 100 döngüden öğrenci–kazanım başına en yeni kayıtla doğrulanmış kazanım oranı, bekleyen çiftler ve ipucu kullanım oranı eklendi. Örneklem sınırı açıklanır.
- Rehberli çalışmada ipucu almadan yeniden deneme açıldı; öğrenme olayında hintUsed gerçek tercihe dayanır.
- Agent yetki matrisi için öğrenci/öğretmen/içerik erişim sınırları test edildi. Model çıktısı bir yetki veya öğretmen onayı oluşturmaz.
- Veli çocuk kaldırma isteğine eksik oturum başlığı eklendi.
- Birim Ekonomisi ekranındaki hata sonrası sonsuz yükleme durumu düzeltildi.

## Ölçüm kuralları

Aktarım puanını doğrulanmış göstermek için tamamlanmış ön/son/aktarım kayıtları, aynı kayıtlarla eşleşen öğretmen incelemeleri ve son testten en az 24 saat sonraki yardımsız aktarım gerekir. Son test puanı aktarım puanının yerine geçmez.

%80, mevcut sürümün açıkça belirtilen ürün eşiğidir; kalibre edilmiş bilimsel beceri olasılığı değildir. Pilot beş soruluk aşamalar kullanır; sonuçlar küçük örneklem olarak yorumlanmalıdır.

İpucu kullanım oranı ölçülen yardım kullanımıdır. Psikolojik bağımlılık ya da gelecekteki beceri kaybı skoru olarak adlandırılmaz. Zaman içinde azalma iddiası için tekrarlı ve karşılaştırılabilir oturum gerekir.

## Gerçek pilotun durumu

Canlı kontrol: ön test %40 ile 4 Ekim 2026 02:29 Türkiye saatiyle tamamlandı. Rehberli çalışma 4 Ekim 11:42'de bir ipucuyla tamamlandı. Son test, öğretmen ön/son incelemesi ve aktarım incelemesi yok.

Öğrenci son teste en erken 5 Ekim 02:29 Türkiye saatiyle girebilir. Sonrasında öğretmen gerçek ön/son test çiftini inceler. Aktarım testi son testin bitiminden en az 24 saat sonra yapılır; öğretmen aktarımı ayrıca inceler. Bu insan eylemleri otomatik oluşturulmaz.

## Kalan bakım ve geliştirme

ESLint geliştirme zincirinde braces 3.0.3 için beş adet ilişkili yüksek uyarı devam ediyor. Kontrol edilen en güncel npm sürümünde yama yok. Next/ESLint'i geriye düşürmek veya uyarıyı bastırmak uygulanmadı. https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

Repo genelindeki eski lint borcu topluca temizlenmedi. Yeni ölçüm dosyalarında hedefli ESLint kontrolü yapılır.

Unused-index INFO kayıtları indekslerin gerekli olmadığı anlamına gelmez; yeni eklenen FK indeksleri veri büyüdükçe kullanılabilir. İndeksler yalnız bu sinyale dayanarak silinmedi. Auth için 10 sabit bağlantı INFO kaydı ayrıca kapasite planlaması gerektirir.

17 sunucuya özel tabloda RLS açık, tarayıcı politikası yok. Bu tabloların yalnız yetkili sunucu tarafından kullanılması amaçlanır; danışman INFO kaydı için tarayıcı erişimi açılmaz.

Makaledeki daha geniş ROI hedefleri için gerçek öğretmen çalışma süresi, karşılaştırma başlangıcı, gelir/iadeler ve tekrar kullanım ölçümleri gerekir. Token veya mesaj sayısından öğretmene kazandırılan süre türetilmez.
