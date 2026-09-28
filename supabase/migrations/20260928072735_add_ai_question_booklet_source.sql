alter table public.exam_resources
  drop constraint if exists exam_resources_source_type_check;

alter table public.exam_resources
  add constraint exam_resources_source_type_check
  check (source_type in ('anonymous', 'teacher', 'ai'));

update public.exam_resources
set reuse_policy = 'exact_reuse'
where source_type = 'ai'
  and reuse_policy <> 'exact_reuse';
