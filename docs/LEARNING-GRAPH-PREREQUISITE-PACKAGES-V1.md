# Learning Graph Ön Koşul Paketleri v1

Bu aşama ders ve sınıf bazındaki ön koşul ilişkilerini doğrudan canlı grafa
yazmak yerine uzman incelemesinden geçen, müfredat sürümüne bağlı paketlerle
yayımlar.

## Yayın akışı

1. Yönetici paket adı, müfredat sürümü ve kaynak referansı girer.
2. Ön koşul ve hedef konu/kazanımı seçerek pedagojik gerekçe ile taslak oluşturur.
3. Her bağlantı ayrı ayrı onaylanır veya gerekçeli biçimde reddedilir.
4. Hazır paket yayımlanırken ders, sınıf, düğüm tipi ve döngü kontrolleri yeniden yapılır.
5. Onaylanan bağlantı `prerequisite_of` olarak, kaynak ve müfredat sürümüyle yayımlanır.

## Güvenlik ve uyumluluk

- Paket tabloları istemciye tamamen kapalıdır; yalnızca sunucu yönetici API'si erişir.
- İşlemler `SECURITY INVOKER` fonksiyonlarla yürür ve yalnızca `service_role` çağırabilir.
- Reddedilen satır için uzman gerekçesi zorunludur.
- Yayın transaction içindedir; tek bir bağlantı döngü yaratırsa paket kısmen yayımlanmaz.
- Mevcut öğrenci akışları yalnızca doğrulanmış graph ilişkilerini okumaya devam eder.

Migrasyonlar:

- `20260909200508_learning_graph_prerequisite_packages_v1.sql`
- `20260909201259_learning_graph_prerequisite_indexes_v1.sql`
