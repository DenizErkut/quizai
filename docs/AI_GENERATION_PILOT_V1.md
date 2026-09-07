# AI Soru Üretimi Pilot v1

## Amaç

K12 ana soru üretiminde `gpt-4.1-mini` ile mevcut Claude kontrol grubunu;
maliyet, teknik güvenilirlik ve öğrenciye ulaşan soru kalitesi açısından aynı
dönemde karşılaştırmak.

## Örneklem ve atama

- Evren: İlk kez başlatılan K12 testleri. Üniversite testleri ve adaptif devam
  parçaları kapsama girmez.
- Atama: Kullanıcı kimliğinden türetilen deterministik 0–9999 kovası. Varsayılan
  dağılım %30 pilot / %70 kontrol; `GPT_PILOT_FRACTION` ile değiştirilebilir.
- Aynı kullanıcı deney boyunca aynı varyantta kalır. Böylece tekrar gelen
  kullanıcıların gruplar arasında karışması engellenir.
- Sonuç kararı için her varyantta en az 100 tamamlanmış oturum ve en az 7 tam gün
  veri gerekir. İki koşuldan geç olan beklenir.
- Karşılaştırma sınıf, ders, soru tipi ve istenen soru sayısına göre tabakalanır.
  Bir grubun daha kolay derslerden oluşması ham ortalamayı yanıltmamalıdır.

## Birincil ölçütler

1. Başarılı test üretim oranı: geçerli bir `quiz_session` oluşturan istekler.
2. Tam soru teslim oranı: teslim edilen / istenen soru sayısı.
3. Tamamlama oranı: başlatılan oturumların `completed=true` olma oranı.
4. Doğrulama sonrası değiştirilen veya elenen soru oranı.
5. Tamamlama turu ihtiyacı: `generate-quiz:topup` çağrısı yapılan isteklerin oranı.
6. Tamamlanmış test ve teslim edilen soru başına USD maliyet.
7. Üretim gecikmesi: medyan ve p95 süre.

Öğrenci puanı tek başına model kalitesi kabul edilmez; öğrenci seviyesi ve konu
zorluğundan güçlü biçimde etkilenir. Yalnızca tabakalanmış yardımcı sinyal olarak
kullanılır.

## Koruma eşikleri

Pilot ancak aşağıdakilerin tamamı sağlanırsa genişletilir:

- Başarısız üretim oranı kontrol grubundan 2 yüzde puanından fazla kötü değil.
- Tam soru teslim oranı kontrol grubundan 3 yüzde puanından fazla kötü değil.
- Bildirilen/hatalı soru oranı kontrol grubundan %20 göreli fazla değil.
- p95 gecikme kontrol grubundan %25 fazla değil.
- Örneklemin hiçbir ana sınıf/ders tabakasında belirgin güvenlik veya müfredat
  uyumu gerilemesi görülmüyor.

## Karar kuralı

- Koruma eşikleri geçilir ve soru başı maliyet en az %15 azalırsa pilot %50'ye
  çıkarılır.
- Kalite eşikleri geçilir fakat maliyet kazanımı %15'in altındaysa dağılım sabit
  tutulur ve bir dönem daha ölçülür.
- Herhangi bir koruma eşiği aşılırsa `GPT_PILOT_FRACTION=0` ile pilot kapatılır;
  ilgili ders/soru tipi kırılımı incelenmeden yeniden açılmaz.

## İzlenebilirlik

`quiz_sessions` üzerinde deney adı, varyant, kova, motor ve istek kimliği;
`ai_usage_logs` üzerinde kullanıcı, oturum, istek ve fiyat sürümü tutulur. Ham
prompt veya ham model cevabı bu alanlara ya da uygulama loglarına yazılmaz.

