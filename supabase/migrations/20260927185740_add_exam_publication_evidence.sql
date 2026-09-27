alter table public.exam_resources
  add column if not exists publication_evidence_paths text[] not null default '{}';

alter table public.exam_resources
  drop constraint if exists exam_resources_publication_evidence_limit;
alter table public.exam_resources
  add constraint exam_resources_publication_evidence_limit
  check (cardinality(publication_evidence_paths) <= 10);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'publication-evidence',
  'publication-evidence',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

comment on column public.exam_resources.publication_evidence_paths is
  'Private Storage object paths for teacher publication-permission screenshots; admin access only.';
