create table public.booklet_processing_jobs (
  resource_id uuid primary key references public.exam_resources(id) on delete cascade,
  content_hash text not null,
  next_chunk integer not null default 0 check (next_chunk >= 0),
  next_batch integer not null default 0 check (next_batch >= 0),
  promoted integer not null default 0 check (promoted >= 0),
  status text not null default 'pending' check (status in ('pending', 'complete')),
  lease_token uuid,
  lease_until timestamptz not null default '-infinity',
  updated_at timestamptz not null default now()
);
alter table public.booklet_processing_jobs enable row level security;
revoke all on public.booklet_processing_jobs from anon, authenticated;
grant all on public.booklet_processing_jobs to service_role;
comment on table public.booklet_processing_jobs is 'Server-only resumable booklet cursors; leases prevent concurrent paid extraction.';
