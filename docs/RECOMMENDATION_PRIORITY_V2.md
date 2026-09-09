# Recommendation Engine v2 — Önceliklendirme

Sıralama, mevcut öneri puanını koruyarak yalnızca mevcutsa bağlamsal sinyaller ekler:

- yaklaşan/kaçırılmış öğretmen ödevi teslim tarihi,
- yaklaşan sınav tarihi,
- kurumun yüksek öncelikli konu işaretleri,
- öğrencinin çalışma süresi bütçesi,
- aynı ders/eylem grubunda çeşitlilik ve yük dengeleme.

Her satırda `priority_breakdown` ile taban puan, her ek katkı, süre bütçesi ve çeşitlilik cezası açıklanır. Sinyali bulunmayan alanın katkısı sıfırdır; bu nedenle eski öğrencilerin sıralaması yapay biçimde şişmez.

Bağlam `student_recommendation_priority_context` tablosunda servis tarafından tutulur. Tablo istemciye kapalıdır; öğrenci yalnızca kimliği doğrulanmış `/api/recommendations/priority` uç noktasından kendi sıralamasını görür.
