# Misconception Expert Review v1

Admin panelindeki inceleme kartı, AI kaynaklı kavram yanılgısı adaylarını kanıt sayısına göre listeler. Uzman bir adayı doğrulayabilir veya zorunlu gerekçeyle reddedebilir. Her karar, önceki durum ve uzman kimliğiyle değiştirilemez inceleme geçmişine yazılır.

## Yayın kapısı

- Yalnız `verified` kayıtlar öğrenci profilindeki bilinen yanılgılar listesine girebilir.
- Yalnız `verified` kayıtlar düzeltici öğrenci önerisine dönüşebilir.
- Migrasyon, daha önce aday durumdayken üretilmiş önerileri temizler.
- Aday kanıtı `student_misconceptions` içinde korunur; uzman kararı ham öğrenme kanıtını silmez.

## Yayın

Önce `scripts/045_misconception_expert_review_v1.sql`, ardından uygulama commit'i yayımlanmalıdır. Red kararında uzman gerekçesi zorunludur.
