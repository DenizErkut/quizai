-- AUS free-practice curriculum overrides. No client receives direct table access.
create table public.open_ended_practice_catalog (
  id uuid primary key default gen_random_uuid(),
  grade_key text not null check (grade_key in ('1','2','3','4','5','6','7','8','9','10','11','12','universite')),
  subject text not null check (length(trim(subject)) between 1 and 120),
  topics text[] not null default '{}',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint open_ended_practice_catalog_grade_subject_unique unique (grade_key, subject),
  constraint open_ended_practice_catalog_topics_limit check (cardinality(topics) <= 100)
);

create index open_ended_practice_catalog_grade_idx
  on public.open_ended_practice_catalog (grade_key, is_active, subject);

alter table public.open_ended_practice_catalog enable row level security;
revoke all on public.open_ended_practice_catalog from public, anon, authenticated;
grant select, insert, update, delete on public.open_ended_practice_catalog to service_role;
