# Tanılayıcı Soru Stratejisi v1

Mastery güveni `düşük` olan veya ilgili konuda hiç Learning Event kanıtı
bulunmayan öğrencinin ilk test parçasında daha dengeli kanıt toplar.

## Politika

- İlk yaklaşık `%40`: temel kavram yoklaması
- Sonraki yaklaşık `%40`: kısa uygulama
- Son yaklaşık `%20`: yaygın yanlış düşünceyi ayırt etme
- Devam parçasında yeniden uygulanmaz; mevcut soru-cevap adaptasyonu devralır.
- Orta/yüksek güvenli öğrencinin mevcut üretim davranışı değişmez.

Her soru `diagnosticStrategyVersion`, `diagnosticReasonCode`, `diagnosticRole`,
`masteryConfidenceBefore` ve `masteryEvidenceCountBefore` alanlarıyla izlenir.
Bu sunucu kaynaklı alanlar Learning Event metadata'sına taşınır.

## Güvenlik ve geri dönüş

Öğrenci tarafından gönderilen bir yetkilendirme alanı kullanılmaz ve yeni tablo
açılmaz. Strateji yalnızca soru dağılımını etkiler; mastery formülünü, puanlamayı,
kota hesabını ve Recommendation Engine sıralamasını değiştirmez.

