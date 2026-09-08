# Question → Canonical Learning Objective Mapping Pipeline v1

Bu pipeline yeni üretilen soruları yalnızca yayımlanmış kanonik kazanımlarla
ilişkilendirir. Katalog boşsa veya uygun kazanım yoksa test üretimi değişmeden
devam eder ve soru `no_candidates` olarak işaretlenir.

## Güven zinciri

1. Sunucu; ders, sınıf ve konu için yalnızca `verified + active` kazanımları
   yükler.
2. Modele UUID verilmez. Adaylar istek ömrü boyunca geçerli `LO1`, `LO2` gibi
   geçici referanslarla sunulur.
3. Model sadece referans seçebilir veya `null` döndürebilir.
4. Sunucu, gelen referansı kendi aday kümesine karşı doğrular; modelin yazdığı
   doğrudan UUID/kod alanlarını siler.
5. Soruya kanonik katalog UUID'si ve resmî kazanım kodu sunucu tarafından eklenir.
6. Learning Event trigger'ı, son savunma katmanı olarak katalogda bulunmayan,
   pasif veya doğrulanmamış kimlikleri `NULL` yapar.

## Gözlemlenebilirlik

`quiz_sessions` üzerinde aday sayısı, eşleşen soru sayısı ve pipeline sürümü;
her soru üzerinde eşleşme durumu tutulur. Böylece kapsama oranı model kalitesiyle
karıştırılmadan ölçülebilir.

Migration: `scripts/031_question_objective_mapping_v1.sql`.

