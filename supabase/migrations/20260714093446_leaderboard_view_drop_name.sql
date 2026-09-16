-- leaderboard view'inden p.name cikar. security_invoker=true ve
-- anon/authenticated/service_role grant'lari KORUNUR (yeniden verilir).
drop view if exists public.leaderboard;

create view public.leaderboard
  with (security_invoker = true)
as
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

grant all on public.leaderboard to anon, authenticated, service_role;
