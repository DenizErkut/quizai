# Catalog Review Triage v1

## Canlı başlangıç durumu

- Bekleyen kayıt: 74
- Eşleştirilmiş kayıt: 33
- Katalog dışı bırakılmış kayıt: 1
- Bekleyenlerin 71'i eski akıştan `Genel` ders etiketiyle geliyor.
- Aktif ve doğrulanmış pilot kazanım: 1 (`MAT.5.1.1`).

## Sınıflandırma

Kuyruk kayıtları pedagojik karar verilmeden önce deterministik olarak şu gruplara ayrılır:

1. `ready_review`: Tek sınıf ve açık ders bilgisi var.
2. `subject_missing`: Tek sınıf var, ders `Genel` olarak kalmış.
3. `multi_grade`: Aynı başlık birden fazla sınıfta gözlenmiş.
4. `non_k12`: Üniversite sınıfı içeriyor; MEB K12 kataloğuna otomatik alınmaz.
5. `likely_free_text`: Uzun soru/prompt biçiminde; konu adı olma olasılığı düşük.

Bu sınıflandırma eşleştirme veya yayın yapmaz. Nihai konu, ünite ve ders kararı admin/uzman onayı gerektirir.

## Öncelik puanı

Kullanım sayısı ve etkilenen öğrenci sayısı yükseldikçe kayıt üst sıraya çıkar.
Belirsiz/gürültülü sınıflar güvenli inceleme için geriye alınır. Puan pedagojik
doğruluk skoru değildir; yalnızca inceleme iş sırasıdır.

## Güvenli ünite önerileri

- Sadece aynı sınıftaki aktif üniteler değerlendirilir.
- Ders bilgisi açıksa aynı ders eşleşmesi ek ağırlık alır.
- Başlık/ünite kelime örtüşmesi yalnızca “olası” etiketi üretir.
- Öneri otomatik seçilmez ve otomatik yayımlanmaz.

## Sonraki işlem

Admin önce `ready_review`, sonra yüksek öncelikli `subject_missing` kayıtlarını
inceler. Çok sınıflı kayıtlar ayrı sınıf kayıtlarına bölünmeden eşleştirilmez;
serbest metin ve K12 dışı içerik ayrı katalog politikasına yönlendirilir.
