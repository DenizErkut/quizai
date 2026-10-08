-- Teachers create several open-ended questions on one topic at once (a batch of
-- open_ended_assignments sharing batch_id), print them, and later import the
-- students' paper answers. Paper answers become ordinary graded sessions.
alter table public.open_ended_assignments
  add column if not exists batch_id uuid,
  add column if not exists batch_index integer;
create index if not exists open_ended_assignments_batch_idx on public.open_ended_assignments (batch_id, batch_index);

alter table public.open_ended_sessions
  add column if not exists source text not null default 'online' check (source in ('online', 'paper')),
  add column if not exists paper_scan_paths text[],
  add column if not exists imported_by uuid references auth.users(id) on delete set null,
  add column if not exists teacher_adjusted boolean not null default false;
create index if not exists open_ended_sessions_assignment_user_idx on public.open_ended_sessions (assignment_id, user_id);
create index if not exists open_ended_sessions_imported_by_idx on public.open_ended_sessions (imported_by);
