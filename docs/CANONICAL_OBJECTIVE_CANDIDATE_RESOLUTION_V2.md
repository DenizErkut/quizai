# Canonical Objective Candidate Resolution v2

Tarih: 8 Eylül 2026

## Bulgu

İlk yayımlanan `MAT.5.1.1` kazanımının `objective → topic → unit → subject` zinciri yapısal olarak doğruydu. Ancak yayımdan hemen sonra çözülen 10 soruluk testte konu adı ünite etiketiyle geldiği için v1'in tam topic eşitliği sağlanmadı:

- Test: `Sayılar ve Nicelikler (1): Doğal Sayılar ve İşlemler`
- Kanonik topic: `2. Tema: Sayılar ve Nicelikler (1): Doğal Sayılar ve İşlemler`
- Sonuç: `0` aday, `0` eşlenen soru

## Düzeltme

Yeni çözümleyici adayları aşağıdaki güvenli öncelik sırasıyla bulur:

1. Tam normalize edilmiş kanonik topic eşleşmesi: `topic_exact`
2. Aynı ders ve sınıftaki doğrulanmış kanonik ünite eşleşmesi: `unit_exact`
3. İnsan tarafından incelenmiş alias eşleşmesi: `reviewed_alias`

Bir üst sırada eşleşme bulunduğunda daha düşük öncelikli sonuçlar karıştırılmaz. Serbest metin benzerliği, fuzzy matching veya AI tahmini kullanılmaz.

Her soruya `objectiveCandidateBasis`, quiz session'a `objective_candidate_basis` yazılarak eşleşmenin hangi kanıtla yapıldığı izlenebilir hâle getirilmiştir.

## Doğrulama

Canlı Supabase üzerinde geri alınan test işlemiyle:

- Kısa ünite etiketi `MAT.5.1.1` için `unit_exact` sonucu verdi.
- Tam kanonik topic `MAT.5.1.1` için `topic_exact` sonucu verdi.
- İlişkisiz test konusu hiçbir aday döndürmedi.
- Çözümleyici `anon` ve `authenticated` rollerine kapalı, yalnızca sunucu `service_role` kullanımına açık kaldı.
- Test sonrasında fonksiyon, kolon ve geçici veri canlıda bulunmadı.

Kalıcı canlı dağıtım sırası `032 → 033 → uygulama kodu` olmalıdır.
