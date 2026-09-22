-- Queue is service-role only; an explicit deny policy documents that contract.
drop policy if exists internal_service_only on public.coach_nudge_jobs;
create policy internal_service_only on public.coach_nudge_jobs
  for all to anon, authenticated using (false) with check (false);

-- Verified before migration: 48 rows, 48 distinct non-null ids.
alter table public.profiles_backup_before_hybrid add primary key (id);
