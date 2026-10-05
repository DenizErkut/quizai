# Kitapçık yükleme süre sınırı — 5 Ekim 2026

## Doğrulanan neden

Üretimde POST /api/admin/exam-upload 120 saniyede 504 ile sonlanmış.
Sunucunun JSON dışı hata metni, istemcide `Unexpected token A` hatası doğurmuş.
8. SINIF FEN BILIMLERI kaydının 91.763 karakter metni ve 69 kaynak parçası
saklanmış, soru havuzuna aktarımı tamamlanmamış.

## Düzenleme

- Yükleme yalnız belge ve kaynak parçalarını kaydeder; yayın izni ardından yüklenir.
- Arama hazırlığı beş parça; ayıklama en fazla sekiz numaralı soru/grup halinde
  ayrı, süre sınırlandırılmış isteklerle yürür. İçerik 300.000 karakteri aşarsa
  sessiz kesme yerine bölme istenir.
- `Soru 001 | ...` başlıkları desteklenir. Satır içi `Cevap: B` global cevap
  anahtarı olarak yorumlanmaz. Kısa cevaplı sorulara seçenek uydurulmaz.
- İşlem imzası, ilerleme ve süreli çalışma kilidi sunucuya özel tabloda tutulur.
  Başarısız grup ilerlemez. Parmak izi tekilliği yeniden denemede soru çoğaltmaz.
- Yüklü kitapçıklardaki `İşlemeyi sürdür / durumu kontrol et` kesilen işlemi
  sürdürür. Bu işlem tarayıcı sayfası açıkken ilerler; bağımsız zamanlayıcı değildir.
- Bekleyen aynı içerik/metadata yüklemesi mevcut kaydı kullanır. Eşzamanlı iki
  ayrı ilk yüklemeye yönelik global benzersizlik garantisi yoktur; işlem kilidi
  aynı kaynak için eşzamanlı ücretli ayıklamayı önler.
- Görsel gerektiren sorular mevcut insan görsel inceleme kapısından geçer.
- Yayın izni kanıtı orijinal timeout sonrasında yüklenmemiş olabilir; tekrar
  yükleme formuyla aynı kayıt kullanılarak eklenebilir. Kanıt uydurulmaz.

## Kontroller

93 birim testi; 25 yetkisiz erişim testi; üretim derlemesi.
Veritabanında RLS açık, anon/authenticated erişimi kapalı, service_role erişimi
açık doğrulandı; iki eşzamanlı işin aynı kilidi alamadığı rollback'li testle
doğrulandı. Advisor'ın `RLS enabled no policy` bilgi notu bu server-only tabloda
kasıtlıdır; istemcilere politika/izin açılmadı.

Tüm 200 sorunun kabul edildiği iddia edilmez: kısa cevap, eksik şekil veya kalite
kontrolünden geçmeyen içerikler otomatik çoktan seçmeli havuza alınmaz.
