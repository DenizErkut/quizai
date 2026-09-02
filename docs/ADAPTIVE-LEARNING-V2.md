# Adaptive Learning Engine v2

Bu sürüm mevcut iki parçalı zorluk ayarını Recommendation Engine kararlarıyla
birleştirir. Öğrenci bir konu seçtiğinde aktif öneri okunur ve testin başlangıç
zorluğu ile pedagojik odağı belirlenir.

## Politika sırası

- `prerequisite_remediation`: kolay başla, ön koşulu yokla, konuya kademeli geç.
- `misconception_review`: doğru/yanlış düşünceyi ayırt ettiren sorularla başla.
- `spaced_review`: ipucusuz geri çağırma sorularıyla başla.
- `mastery_practice`: mastery seviyesine göre kolay/normal başla ve kademeli artır.
- Aktif sinyal yoksa mevcut mastery tabanlı zorluk davranışı korunur.

İkinci test parçası öğrencinin ilk parçadaki gerçek doğruluk oranına göre mevcut
zorluk merdivenini kullanmaya devam eder. Böylece uzun dönem öğrenci modeli ile
anlık performans aynı akışta birleşir.

## Denetlenebilirlik

Her üretilen soruda aşağıdaki alanlar saklanır:

- `adaptivePolicyVersion`
- `adaptiveFocus`
- `adaptiveReasonCode`
- `adaptiveRecommendationId`

Bu iz hem quiz session sorusunda hem de ilgili immutable Learning Event'in
`metadata` alanında tutulur. Böylece kararlar olay günlüğünden geriye dönük
incelenebilir.
