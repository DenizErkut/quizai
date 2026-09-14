alter table public.daily_challenges
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists daily_challenges_user_date_idx
  on public.daily_challenges (user_id, date);

drop policy if exists daily_challenges_select_all on public.daily_challenges;
create policy daily_challenges_select_own on public.daily_challenges
  for select to authenticated using ((select auth.uid()) = user_id);
create policy daily_challenges_insert_own on public.daily_challenges
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy daily_challenges_update_own on public.daily_challenges
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.daily_challenges from anon;
grant select, insert, update on public.daily_challenges to authenticated;
