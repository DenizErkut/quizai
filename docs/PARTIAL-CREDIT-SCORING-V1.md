# Kısmi Puan Modeli v1

## Kapsam

- Eşleştirme: doğru eşleştirilen öğe sayısı / toplam öğe sayısı.
- Sıralama: doğru kurulan ikili sıra ilişkileri / tüm ikili ilişkiler (Kendall yaklaşımı).
- Açık uçlu: kanonik sunucu rubriği esas alınır; her kriter puanı `0..maxPoints`, toplam puan da soru toplamıyla sınırlandırılır.

## Veri uyumluluğu

Eski `score` ve `pct` alanları liderlik ve mevcut raporlar için korunur. Hassas sonuçlar
`partial_score` ve `partial_pct` alanlarına yazılır. Cevap içindeki `awardedScore` değeri
sunucuda `0..1` aralığına alınır ve Learning Event `score` alanına aktarılır. Eski cevaplar
`correct=true/false` üzerinden 1/0 olarak çalışmaya devam eder.

## Yayın sırası

1. `scripts/044_partial_credit_scoring_v1.sql` migrasyonunu uygula.
2. Uygulama commit'ini yayımla.
3. Eşleştirme ve sıralama testi çöz; `quiz_sessions.partial_*` ile `learning_events.score` değerlerini karşılaştır.

## Riskler

- Kısmi cevaplar eski liderlik tablosunda en yakın tam sayıya yuvarlanır; hassas raporlama yeni alanları kullanır.
- Aynı metne sahip tekrarlı sıralama öğeleri güvenilir biçimde ayrıştırılamaz; soru kalite motoru benzersiz öğeleri zorunlu tutmalıdır.
- Daha önce üretilmiş Learning Event kayıtları değiştirilmez; model yalnız yeni çözümlere uygulanır.
