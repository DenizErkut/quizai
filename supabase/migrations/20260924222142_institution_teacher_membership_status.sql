alter table public.institution_users
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references auth.users(id) on delete set null;

alter table public.institution_users
  drop constraint if exists institution_users_active_deactivation_metadata_check;

alter table public.institution_users
  add constraint institution_users_active_deactivation_metadata_check
  check (not is_active or (deactivated_at is null and deactivated_by is null));

create index if not exists institution_users_active_teachers_idx
  on public.institution_users (institution_id, joined_at)
  where role = 'teacher' and is_active;

drop policy if exists institution_users_select_merged on public.institution_users;
create policy institution_users_select_merged on public.institution_users
  for select to authenticated
  using (
    (user_id = (select auth.uid()) and is_active)
    or private.is_institution_admin(institution_id)
  );
