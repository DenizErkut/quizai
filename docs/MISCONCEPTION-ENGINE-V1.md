# Misconception Engine v1

Pratium artık yanlış cevabı yalnızca konu istatistiği olarak değil, yanlış
şıkkın temsil ettiği olası kavramsal hata olarak da kaydedebilir.

## Güven modeli

- Bir yanlış cevap `suspected` kabul edilir; kesin teşhis değildir.
- Aynı yanılgı için üç bağımsız Learning Event oluşunca durum `confirmed` olur.
- Güven skoru `1 - exp(-evidence_count / 3)` formülüyle açıklanabilir biçimde artar.
- AI etiketleri katalogda `candidate` başlar; uzmanlar daha sonra doğrulayabilir
  veya reddedebilir.
- Cevapsız sorular ve anlamlı bir yanlış-şık etiketi bulunmayan soru tipleri
  yanılgı kanıtı üretmez.

## Akış

1. Soru üretimi yanlış seçeneklerin olası kavramsal hatalarını metadata olarak üretir.
2. Sunucu, seçilen yanlış seçenekle metadata'yı eşleştirir ve kararlı bir kimlik hesaplar.
3. Mevcut Learning Event RPC'si bu kimliği immutable event'e yazar.
4. `refresh_quiz_misconceptions` katalog ve öğrenci durumunu idempotent biçimde yeniler.
5. Mastery son sinyali alır; Student Learning Profile'ın `known` listesine
   yalnızca doğrulanma eşiğine ulaşmış yanılgılar girer.

## Sınırlar

Bu sürüm davranışsal bir hipotez üretir; psikolojik veya klinik teşhis üretmez.
Eşleştirme, sıralama ve açık uçlu sorularda seçilen hatanın anlamı güvenilir
biçimde çıkarılamadığı için v1'de yanılgı etiketi oluşturulmaz.
