# TR Kimlik Mimarisi — Migration Sırası (destructive drop ÖNCESİ)

`supabase-profiles-migration.sql` (name/surname/phone DROP) çalıştırılmadan
ÖNCE aşağıdaki 5 madde tamamlanıp test edilmeli. Destructive drop en son,
ayrıca ve birlikte planlanacak — bu klasörde YOK.

| # | Dosya / Değişiklik | Ne zaman | Not |
|---|---|---|---|
| 1 | `001_teachers_nullable_identity.sql` | **HEMEN** (bağımsız) | teachers.name/email NOT NULL → nullable. Yeni öğretmen kaydı kodunu unblock eder. |
| 2 | Kod: leaderboard/page.tsx + `003_leaderboard_view_drop_name.sql` | **birlikte** | Sayfa isimleri resolve'dan çeker; view name'siz yeniden yaratılır. |
| 3 | Kod: app/auth/callback + app/(auth)/callback | kodla | Gerçek callback name yazmaz + TR-PG identity oluşturur; ölü /callback → redirect. |
| 4 | Kod: app/api/kvkk/route.ts | kodla | Export'a TR-PG identity, silmeye deleteIdentity. |
| 5 | Kod: register/page.tsx (metadata name kaldırıldı) + `002_handle_new_user_drop_name.sql` | **AYNI deploy** | Trigger name yazmayı bırakır; ikisi birlikte gitmeli. |

## Uygulama komutları (Supabase)
Her `.sql` dosyası ayrı bir migration olarak uygulanır. 001 hemen; 002 ve 003
ilgili kod deploy'u ile aynı anda.

## En son (bu klasörde DEĞİL — ayrıca planlanacak)
`supabase-profiles-migration.sql`: yukarıdaki 1-5 tamamlanıp test edildikten
SONRA `profiles.name/surname/phone` ve `teachers.name/email/phone` DROP.
Bu geri alınamaz; verinin TR-PG'de doğrulanması şart.
