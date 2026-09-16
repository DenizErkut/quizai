create table if not exists public.question_bank_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  limit_count integer not null default 200 check (limit_count between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  result jsonb,
  expires_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.question_bank_backfill_jobs enable row level security;
revoke all on table public.question_bank_backfill_jobs from anon, authenticated;
grant all on table public.question_bank_backfill_jobs to service_role;
