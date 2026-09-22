# Supabase Advisor remediation — 22 Eylül 2026

## Kapatılanlar

- Security-definer `leaderboard` görünümü server-only + `security_invoker` yapıldı.
- Authenticated çağrıya açık security-definer fonksiyonlar kaldırıldı veya private şemaya taşındı.
- `vector` eklentisi `public` yerine `extensions` şemasına taşındı.
- RLS açık ama politikasız iç tablolar explicit fail-closed politikalara bağlandı.
- `coach_action_clicks.message_id` yabancı anahtar indeksi eklendi.
- `profiles_backup_before_hybrid.id` birincil anahtar yapıldı.
- Koç tablolarında authenticated rolünün yazma, truncate, trigger ve references yetkileri kaldırıldı.

## Kalan performans bulguları için güvenli kapanış planı

1. `unused_index` (96): İndeksler yalnızca en az 30 günlük `pg_stat_user_indexes` gözlemi, son istatistik sıfırlama zamanı ve sorgu logları birlikte değerlendirildikten sonra kaldırılacak. Yabancı anahtar, benzersizlik, RLS ve zamanlanmış işlerce kullanılan indeksler otomatik olarak hariç tutulacak. Önce staging'de `DROP INDEX CONCURRENTLY`, sonra sorgu p95 ve kilit bekleme karşılaştırması yapılacak.
2. `multiple_permissive_policies` (122): Aynı tablo/eylem/rol politikaları davranış eşdeğerliği test edilerek tek `OR` politikasına birleştirilecek. Öncelik sırası: `notifications`, `streaks`, `quiz_sessions`, `weak_topics`, ardından kurum/öğretmen tabloları. Her grup tenant-isolation E2E testinden sonra ayrı migration olarak çıkacak.
3. `auth_db_connections_absolute` (1): Supabase Dashboard'da Auth connection allocation değeri sabit 10 yerine yüzde tabanlı yapılacak. Bu Management API/SQL ayarı olmadığı için bakım kontrol listesinde manuel platform ayarı olarak tutulur.

## Kabul ölçütü

- Security Advisor: sıfır bulgu.
- Performans değişikliklerinde p95 gerilemesi yok ve tenant-isolation testleri yeşil.
- Kullanılmayan indeks kararı tek bir anlık Advisor taramasına dayanmayacak.
