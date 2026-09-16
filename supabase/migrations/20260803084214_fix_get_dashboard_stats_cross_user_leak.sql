-- get_dashboard_stats(p_user_id) SECURITY DEFINER oldugu icin RLS'i
-- bypass ediyordu ve p_user_id parametresini auth.uid() ile hic
-- KARSILASTIRMIYORDU - yani herhangi bir authenticated kullanici,
-- BASKA bir kullanicinin id'sini vererek onun performans ozetini
-- (toplam test, ortalama yuzde, zayif konu sayisi) gorebiliyordu.
-- Uygulama HER ZAMAN kendi user.id'sini gonderiyor (app/dashboard
-- ya da benzeri sayfa) - bu yuzden p_user_id = auth.uid() sartini
-- eklemek mevcut mesru kullanimi ETKILEMIYOR, sadece baskasinin
-- id'sini denemeyi sessizce bos sonuca dusuruyor (hata firlatmiyor,
-- fail-safe).
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_id uuid)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  select json_build_object(
    'total_count',   count(*),
    'total_correct', coalesce(sum(score), 0),
    'total_questions', coalesce(sum(question_count), 0),
    'avg_pct',       coalesce(round(avg(pct)), 0),
    'best_pct',      coalesce(max(pct), 0),
    'weak_count',    count(*) filter (where pct < 55)
  )
  from quiz_sessions
  where user_id = p_user_id and completed = true
    and p_user_id = auth.uid();
$$;
