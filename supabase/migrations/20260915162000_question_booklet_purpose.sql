alter table public.exam_resources
  add column if not exists purpose text not null default 'exam'
  check (purpose in ('exam','instant_test'));
create index if not exists exam_resources_purpose_idx
  on public.exam_resources (purpose, exam_type, grade, subject, subtopic, review_status);
