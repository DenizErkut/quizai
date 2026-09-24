create index if not exists institution_users_deactivated_by_idx
  on public.institution_users (deactivated_by)
  where deactivated_by is not null;
