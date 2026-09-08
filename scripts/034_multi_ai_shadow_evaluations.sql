-- Multi-AI Gateway v3: metric-only shadow comparison records.
-- Raw prompts, questions and provider responses must never be stored here.
create table if not exists public.ai_shadow_evaluations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  quiz_session_id uuid null references public.quiz_sessions(id) on delete set null,
  user_id uuid null references auth.users(id) on delete set null,
  policy_version text not null,
  task text not null,
  control_provider text not null,
  control_model text not null,
  shadow_provider text not null,
  shadow_model text not null,
  expected_count integer not null check (expected_count >= 0),
  delivered_count integer not null check (delivered_count >= 0),
  structurally_valid_count integer not null check (structurally_valid_count >= 0),
  duplicate_count integer not null check (duplicate_count >= 0),
  duration_ms integer null check (duration_ms is null or duration_ms >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  error_code text null,
  created_at timestamptz not null default now()
);

alter table public.ai_shadow_evaluations enable row level security;
revoke all on table public.ai_shadow_evaluations from anon, authenticated;
grant select, insert on table public.ai_shadow_evaluations to service_role;

create unique index if not exists ai_shadow_evaluations_request_shadow_uidx
  on public.ai_shadow_evaluations(request_id, shadow_provider, shadow_model);
create index if not exists ai_shadow_evaluations_created_idx
  on public.ai_shadow_evaluations(created_at desc);
