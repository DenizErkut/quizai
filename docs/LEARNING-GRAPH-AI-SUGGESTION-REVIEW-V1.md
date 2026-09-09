# Learning Graph AI Öneri ve Uzman İnceleme v1

Mevcut AI taslak üreticisi, serbest metin taslak tablosu yerine sürümlü uzman
ön koşul paketlerine bağlandı.

- AI yalnızca seçilen müfredat kaydında bulunan ve kanonik graph düğümü olan
  konu adlarını kullanabilir.
- Uydurulan, mükerrer veya kendi kendine bağlanan öneriler sunucuda elenir.
- Model çıktısının ham hâli saklanmaz; yalnızca normalize edilmiş aday ilişkiler tutulur.
- Model, politika sürümü, istek kimliği, önerilen ve elenen aday sayısı kaydedilir.
- AI maliyeti kullanıcı ve istek bağlamıyla `ai_usage_logs` üzerinden izlenir.
- Her aday uzman tarafından ayrı ayrı onaylanır veya gerekçeli reddedilir.
- AI hiçbir koşulda doğrudan Learning Graph'a yayın yapamaz.
- Yayın, uzman paket akışındaki ders/sınıf ve döngü kontrollerinden geçer.
