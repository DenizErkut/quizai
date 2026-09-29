# Learning Gain Measurement v1 — öğretmen pilotu

Öğretmen panelindeki pilot, aynı öğrencinin aynı kanonik kazanıma bağlı iki tamamlanmış testini ön ve son ölçüm olarak eşleştirir. Öğretmen soruları ve cevap anahtarlarını inceleyip eşleşmeyi onaylar. Daha sonra ayrı bir aktarım testi ekleyebilir.

## Ölçüm kuralları

- Her testte en az 5 yanıtlanmış soru olmalı. Soruların tamamı aynı aktif/doğrulanmış kazanıma bağlı, bağımsız kalite kontrolünden geçmiş ve kazanım eşleşmesi doğrulanmış olmalı.
- Ön ve son testin soru sayısı ve zorluk dağılımı aynı olmalı. Aynı soru metni iki testte kullanılamaz.
- Testlerin tamamlanma zamanı Learning Event kayıtlarından alınır. Ön ve son test arasında 1–90 gün olmalı.
- Aktarım testi ön ve son testteki soruları tekrarlamamalı, aynı kazanımı aynı soru sayısı ve zorluk dağılımıyla ölçmeli. Öğretmen yeni bağlamı ayrıca gözden geçirir.
- Puan, kaydedilmiş yanıtların soru başına puanından yeniden hesaplanır. Kazanım, son test yüzdesi eksi ön test yüzdesidir; birim **yüzde puan**dır. Aktarım kazanımı aktarım testi eksi ön testtir.
- Sınıf ortalaması en az 5 öğrenci-kazanım çifti oluşmadan gösterilmez. Aynı öğrenci/kazanım için birden çok ölçüm varsa en güncel olanı özet hesabına girer.

Bu kayıtlar betimleyici pilot verisidir. Öğrenmenin hangi müdahaleden kaynaklandığını tek başına göstermez. Öğretmenin ayrıca kontrol ettiği hatalı kazanım etiketleri düzeltilmeden ilgili sorular ölçüme alınmamalıdır.

## Prof. Prati koçu

Öğrencinin mevcut Performans Analizi → Zayıf Noktalar ekranındaki yapay zekâ koçu (`/api/ai-analysis`), her değerlendirme isteğinde sunucudan yalnızca oturum sahibinin güncel öğrenme kazanımı ölçümlerini yeniden okur. Tüm ön/son çiftlerini tarar; aynı öğrenci/kazanım için en yeni çifti özete alır. Son 100 ustalık kaydı, 30 öneri ve 30 tamamlanmış test özetini de bağlam olarak kullanır; bu sınırlar yanıtın kanıt alanında görünür. Tarayıcıdan gönderilen zayıf konu, puan veya öğrenci kimliği kanıt kabul edilmez. Model erişilemezse veya ölçüm yoksa ölçüm yapılmış gibi davranmadan sayısal bir açıklama döner. Koç yalnızca yorumlar; kazanım doğrulamaz, ölçüm veya öğretmen notu değiştirmez. Yeni bir testten sonra kullanıcı “Yeniden değerlendir” ile güncel kayıtları tekrar okutur.


## Kurulum ve doğrulama

Veritabanı geçişi: `supabase/migrations/20260929173440_learning_gain_measurement_v1.sql`. Canlı veritabanında tablo kuruldu; yayınlanan kod ayrıca doğrulanmalıdır.

Prof. Prati'nin asıl koç sohbeti (`/koc`), her sohbette yalnız oturum sahibinin bu tablodaki tüm ölçüm çiftlerini yeniden okur. Aynı kazanım için son çifti güncel ölçüm sayar. Aktarım kanıtı yoksa aktarım sonucu iddia etmez; beşten az çift için ortalama vermez. Kazanım eşleştirmeleri insan incelemesindedir ve ön/son farkı nedensel etki olarak sunulmaz.

Yerel kontroller: `npx tsx --test tests/learning-gain-measurement.test.ts`, `npx tsc --noEmit`, yeni dosyalarda ESLint. Üretim derlemesi Supabase ortam değişkenleri gerektirir.
