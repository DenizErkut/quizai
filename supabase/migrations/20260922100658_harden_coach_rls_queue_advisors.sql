-- Coach writes are server-owned. Authenticated clients may only read their own
-- conversation; this prevents forged assistant messages and transcript edits.
drop policy if exists coach_conversations_own on public.coach_conversations;
create policy coach_conversations_select_own on public.coach_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists coach_messages_insert_own on public.coach_messages;
revoke insert, update, delete on public.coach_conversations from authenticated;
revoke insert, update, delete on public.coach_messages from authenticated;
grant select on public.coach_conversations, public.coach_messages to authenticated;

-- A click may only reference a message belonging to the same student.
create index if not exists coach_action_clicks_message_id_idx on public.coach_action_clicks(message_id);
drop policy if exists coach_action_clicks_insert_own on public.coach_action_clicks;
create policy coach_action_clicks_insert_own on public.coach_action_clicks
  for insert to authenticated with check (
    (select auth.uid()) = user_id and (
      message_id is null or exists (
        select 1 from public.coach_messages m
        join public.coach_conversations c on c.id = m.conversation_id
        where m.id = coach_action_clicks.message_id and c.user_id = (select auth.uid())
      )
    )
  );

alter table public.notifications add column if not exists action_url text;

-- Durable, idempotent queue for proactive coach work.
create table if not exists public.coach_nudge_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_for date not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','skipped','failed')),
  reason text,
  attempts smallint not null default 0,
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  worker_id uuid,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, scheduled_for)
);
alter table public.coach_nudge_jobs enable row level security;
revoke all on public.coach_nudge_jobs from public, anon, authenticated;
grant all on public.coach_nudge_jobs to service_role;
create index if not exists coach_nudge_jobs_pending_idx on public.coach_nudge_jobs(available_at, created_at) where status = 'pending';

create or replace function public.claim_coach_nudge_jobs(p_limit integer, p_worker_id uuid)
returns setof public.coach_nudge_jobs
language sql security definer set search_path = ''
as $$
  with picked as (
    select id from public.coach_nudge_jobs
    where status = 'pending' and available_at <= now()
    order by available_at, created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 20)
  )
  update public.coach_nudge_jobs j
  set status='processing', attempts=j.attempts+1, locked_at=now(), worker_id=p_worker_id, updated_at=now()
  from picked where j.id=picked.id returning j.*;
$$;
revoke all on function public.claim_coach_nudge_jobs(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_coach_nudge_jobs(integer, uuid) to service_role;

-- Advisor: leaderboard is no longer an exposed security-definer view. The app
-- reads it through an authenticated server route.
alter view public.leaderboard set (security_invoker = true);
revoke all on public.leaderboard from public, anon, authenticated;
grant select on public.leaderboard to service_role;

-- Advisor: this function already constrains p_user_id to auth.uid(), so invoker
-- mode preserves behavior while honoring quiz_sessions RLS.
alter function public.get_dashboard_stats(uuid) security invoker;

-- Keep the recursion-breaking institution helper outside the exposed schema.
create schema if not exists private;
create or replace function private.is_institution_admin(check_institution_id uuid)
returns boolean language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.institution_users
    where institution_id = check_institution_id
      and user_id = (select auth.uid()) and role = 'admin'
  );
$$;
revoke all on function private.is_institution_admin(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_institution_admin(uuid) to authenticated;
drop policy if exists institution_users_select_merged on public.institution_users;
create policy institution_users_select_merged on public.institution_users for select to authenticated
  using (user_id = (select auth.uid()) or private.is_institution_admin(institution_id));
drop function if exists public.is_institution_admin(uuid);

-- Explicit fail-closed policies document internal/service-only tables and clear
-- ambiguous "RLS enabled, no policy" advisor notices without widening access.
do $$
declare t text;
begin
  foreach t in array array[
    'adaptive_learning_evaluations','adaptive_teacher_overrides','agent_action_approval_queue','agent_decision_audit',
    'ai_shadow_evaluations','curriculum_versions','data_lifecycle_requests','exam_question_bank',
    'learning_catalog_review_audit','learning_catalog_review_queue','learning_content_node_mappings','learning_graph_edge_history',
    'learning_graph_prerequisite_items','learning_graph_prerequisite_packages','learning_objective_import_batches','learning_objective_import_items',
    'learning_objective_lifecycle_audit','learning_objective_review_audit','learning_objective_revisions','learning_risk_actions',
    'learning_risk_snapshots','learning_topic_aliases','mastery_calibration_measurements','mastery_shadow_measurements',
    'misconception_aliases','misconception_counter_evidence','misconception_micro_content_audit','misconception_review_audit',
    'profiles_backup_before_hybrid','question_bank','question_bank_backfill_jobs','question_bank_events',
    'question_difficulty_measurements','recommendation_impact_measurements','retention_calibration_measurements','student_recommendation_priority_context'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists internal_service_only on public.%I', t);
      execute format('create policy internal_service_only on public.%I for all to anon, authenticated using (false) with check (false)', t);
    end if;
  end loop;
end $$;

-- Supabase recommends extensions outside public; vector is relocatable and
-- existing dependencies follow its object OIDs.
create schema if not exists extensions;
alter extension vector set schema extensions;
