# Kavram Yanılgısı Düzeltici Mikro İçerik v1

Bu pipeline yalnızca uzman tarafından doğrulanmış kanonik kavram yanılgıları
için kısa düzeltici içerik hazırlar.

- AI yalnızca taslak üretir; otomatik yayın yapamaz.
- Açıklama, düzeltme stratejisi, somut örnek ve kontrol sorusu zorunludur.
- Uzman taslağı düzenleyebilir, onaylayabilir veya gerekçeli reddedebilir.
- Ham AI yanıtı tutulmaz; model, politika sürümü ve istek kimliği kaydedilir.
- Öğrenci yalnızca kendisinde doğrulanmış/aktif olan yanılgıya ait onaylı içeriği okuyabilir.
- Taslak, reddedilmiş ve başka öğrencilere ait içerikler RLS ile kapalıdır.
- Her uzman kararı içerik anlık görüntüsüyle denetim geçmişine yazılır.

Migrasyon: `20260909202550_misconception_micro_content_v1.sql`.
