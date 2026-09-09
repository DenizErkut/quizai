# Adaptive Learning v3

İkinci test parçası artık yalnızca doğruluk oranına değil, son sorulardaki performans dizisine de bakar:

- Art arda iki yanlışta zorluk bir kademe düşer, soru biçimi daha düşük bilişsel yükte bir türe geçer ve mevcut müdahale ekranı açılır.
- Art arda üç doğrudan sonra zorluk bir kademe yükselir.
- Dengeli performansta seviye ve soru biçimi korunur.
- Zorluk `kolay` ile `çok zor` arasında, soru türü güvenli desteklenen türler arasında sınırlandırılır.

Bu sürüm üretim maliyetini artırmamak için mevcut iki parçalı oturumun ikinci parçasına uygulanır. Her soruda gerçek üretim/sunum döngüsü ve adaptif/standart etki karşılaştırması sonraki adımlardır.
