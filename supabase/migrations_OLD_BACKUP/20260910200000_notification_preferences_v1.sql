create table if not exists public.notification_preferences (user_id uuid primary key references auth.users(id) on delete cascade, assignment boolean not null default true, streak boolean not null default true, achievement boolean not null default true, weekly_summary boolean not null default true, teacher_message boolean not null default true, push_enabled boolean not null default true, updated_at timestamptz not null default now());
alter table public.notification_preferences enable row level security;
create policy "notification_preferences_self" on public.notification_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

