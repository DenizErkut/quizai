
create table if not exists public.reading_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  source_type text not null,
  raw_text text not null,
  char_count integer not null default 0,
  chunks jsonb not null default '[]'::jsonb,
  chunk_count integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.reading_materials enable row level security;
create policy reading_materials_own on public.reading_materials for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  material_id uuid not null references public.reading_materials(id) on delete cascade,
  current_chunk integer not null default 0,
  total_chunks integer not null default 0,
  correct_count integer not null default 0,
  total_questions integer not null default 0,
  completed boolean not null default false,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);
alter table public.reading_sessions enable row level security;
create policy reading_sessions_own on public.reading_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.reading_attention_checks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.reading_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  chunk_index integer not null,
  question text not null,
  options jsonb not null,
  correct_index integer not null,
  chosen_index integer,
  is_correct boolean,
  asked_at timestamptz not null default now(),
  answered_at timestamptz
);
alter table public.reading_attention_checks enable row level security;
create policy reading_attention_checks_own on public.reading_attention_checks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_reading_materials_user on public.reading_materials(user_id);
create index if not exists idx_reading_sessions_user on public.reading_sessions(user_id);
create index if not exists idx_reading_attention_checks_session on public.reading_attention_checks(session_id);
