create table if not exists public.question_bank_events (
  id bigint generated always as identity primary key,
  request_id uuid,
  user_id uuid references public.profiles(id) on delete set null,
  quiz_session_id uuid references public.quiz_sessions(id) on delete set null,
  subject_key text not null,
  topic_key text not null,
  grade_key text not null,
  requested_count integer not null check (requested_count > 0),
  bank_count integer not null check (bank_count >= 0),
  ai_count integer not null check (ai_count >= 0),
  outcome text not null check (outcome in ('miss','partial','full')),
  created_at timestamptz not null default now()
);

create index if not exists question_bank_events_created_at_idx on public.question_bank_events (created_at desc);
create index if not exists question_bank_events_topic_idx on public.question_bank_events (topic_key, grade_key, created_at desc);
alter table public.question_bank_events enable row level security;
revoke all on table public.question_bank_events from public, anon, authenticated;
grant all on table public.question_bank_events to service_role;
