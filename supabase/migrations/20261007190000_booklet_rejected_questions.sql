-- Why a booklet question did not reach the pool. Extraction, shape checks and the
-- independent validator drop questions silently; the admin needs the reason to
-- fix the source or re-import the question.
create table if not exists public.booklet_rejected_questions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.exam_resources(id) on delete cascade,
  question_number integer,
  question_text text not null default '',
  stage text not null check (stage in ('not_extracted', 'invalid_shape', 'validator')),
  reason text not null default '',
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (resource_id, dedupe_key)
);
create index if not exists booklet_rejected_questions_resource_idx on public.booklet_rejected_questions (resource_id, question_number);
alter table public.booklet_rejected_questions enable row level security;
revoke all on public.booklet_rejected_questions from public, anon, authenticated;
grant all on public.booklet_rejected_questions to service_role;
