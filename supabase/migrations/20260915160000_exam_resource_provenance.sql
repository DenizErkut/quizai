alter table public.exam_resources
  add column if not exists source_type text not null default 'anonymous',
  add column if not exists reuse_policy text not null default 'reference_only',
  add column if not exists grade text not null default '',
  add column if not exists subtopic text not null default '',
  add column if not exists review_status text not null default 'pending',
  add column if not exists uploaded_by uuid,
  add column if not exists file_name text;

alter table public.exam_resources
  drop constraint if exists exam_resources_source_type_check;
alter table public.exam_resources
  add constraint exam_resources_source_type_check check (source_type in ('anonymous','teacher'));
alter table public.exam_resources
  drop constraint if exists exam_resources_reuse_policy_check;
alter table public.exam_resources
  add constraint exam_resources_reuse_policy_check check (reuse_policy in ('reference_only','exact_reuse'));
alter table public.exam_resources
  drop constraint if exists exam_resources_review_status_check;
alter table public.exam_resources
  add constraint exam_resources_review_status_check check (review_status in ('pending','approved','rejected'));

alter table public.exam_chunks
  add column if not exists source_type text not null default 'anonymous',
  add column if not exists reuse_policy text not null default 'reference_only',
  add column if not exists grade text not null default '',
  add column if not exists subtopic text not null default '';

create index if not exists exam_resources_reference_lookup_idx
  on public.exam_resources (exam_type, grade, subject, subtopic, review_status);

update public.exam_resources
set reuse_policy = case when source_type = 'teacher' then 'exact_reuse' else 'reference_only' end
where reuse_policy = 'reference_only' and source_type = 'teacher';
