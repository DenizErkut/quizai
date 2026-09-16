alter table public.adaptive_learning_evaluations
  add column if not exists day1_mastery numeric(5,2),
  add column if not exists day1_retention numeric(5,2),
  add column if not exists day1_pct numeric(5,2),
  add column if not exists day1_test_count integer,
  add column if not exists day1_completion_rate numeric(6,5),
  add column if not exists day1_avg_duration_seconds numeric(10,2),
  add column if not exists day1_measured_at timestamptz,
  add column if not exists day7_mastery numeric(5,2),
  add column if not exists day7_retention numeric(5,2),
  add column if not exists day7_pct numeric(5,2),
  add column if not exists day7_test_count integer,
  add column if not exists day7_completion_rate numeric(6,5),
  add column if not exists day7_avg_duration_seconds numeric(10,2),
  add column if not exists day7_measured_at timestamptz;

create index if not exists adaptive_learning_evaluations_pending_checkpoints_idx
  on public.adaptive_learning_evaluations (observation_started_at, day1_measured_at, day7_measured_at)
  where day7_measured_at is null;
