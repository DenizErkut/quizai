alter table public.daily_challenges
  add column if not exists bank_question_count integer not null default 0,
  add column if not exists generated_question_count integer not null default 0,
  add column if not exists focus_topics jsonb not null default '[]'::jsonb,
  add column if not exists completed_at timestamptz;
create index if not exists daily_challenges_completion_idx on public.daily_challenges (user_id, completed, date);
