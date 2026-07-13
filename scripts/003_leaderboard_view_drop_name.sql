-- 003_leaderboard_view_drop_name.sql
-- ⚠️ SADECE kod deploy'u ile AYNI ANDA uygulanır.
--
-- Bağımlı kod değişikliği: app/leaderboard/page.tsx — artık isimleri view'den
-- değil /api/identity/resolve'dan çekiyor (view yalnızca id/grade/puan sağlar).
--
-- leaderboard view'inden p.name çıkarılıyor. CREATE OR REPLACE VIEW bir kolonu
-- KALDIRAMADIĞI için DROP + CREATE gerekiyor (kısa bir an view yok olur —
-- migration penceresinde kabul edilebilir).
--
-- NOT: profiles.name kolonunu SİLMEZ; sadece view'in ona bağımlılığını kaldırır
-- (böylece en son adımdaki destructive drop bu view yüzünden patlamaz).

drop view if exists public.leaderboard;

create view public.leaderboard as
select
  p.id,
  p.grade,
  coalesce(s.total_points, 0)                   as points,
  coalesce(s.current_streak, 0)                 as streak,
  count(qs.id)                                  as total_tests,
  coalesce(round(avg(qs.pct)), 0::numeric)      as avg_pct,
  rank() over (order by coalesce(s.total_points, 0) desc) as rank
from profiles p
  left join streaks s       on s.user_id = p.id
  left join quiz_sessions qs on qs.user_id = p.id and qs.completed = true
group by p.id, p.grade, s.total_points, s.current_streak;
