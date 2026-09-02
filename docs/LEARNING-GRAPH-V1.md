# Pratium Learning Graph v1

Bu faz düz metin konu ilişkilerini, genişletilebilir bir node/edge modeline taşır.

## Kapsam

- Aktif `curriculum` konuları `learning_graph_nodes` içine alınır.
- Ön koşul ilişkileri `learning_graph_edges` içinde `prerequisite_of` olarak tutulur.
- Yalnızca admin tarafından onaylanmış AI taslakları doğrulanmış edge oluşturur.
- Onay, graph kaydı, legacy uyumluluk kaydı ve draft durumunu tek transaction'da günceller.
- Quiz üretimi ön koşul eksiklerini artık Learning Event tabanlı `student_mastery` üzerinden değerlendirir.
- Migration uygulanmamış ortamlarda `topic_prerequisites` fallback'i mevcut davranışı korur.

## Güvenlik ve veri yönetişimi

- Oturum açmış kullanıcılar yalnızca aktif node ve doğrulanmış edge okuyabilir.
- İstemci tarafına graph yazma yetkisi verilmez.
- Onay RPC'si yalnızca `service_role` tarafından çalıştırılabilir.
- AI ilişkileri kendiliğinden yayınlanmaz; eğitim uzmanı/admin onayı zorunludur.

## Migration / geri dönüş notu

`scripts/014_learning_graph_v1.sql` eklemeli ve geriye uyumludur; mevcut
`topic_prerequisites` tablosunu silmez. Geri dönüş gerekirse uygulama fallback
üzerinden çalışmaya devam eder. Yeni tabloları silmeden önce edge/node verisi
dışa aktarılmalıdır.

## Sonraki içerik işi

Bu şema MEB grafının teknik temelidir; bütün ön koşul ilişkilerinin doğruluğunu
tek başına garanti etmez. Ders/sınıf bazlı kazanım kodları ve ilişkiler eğitim
uzmanı incelemesiyle, küçük paketler halinde yayınlanmalıdır.
