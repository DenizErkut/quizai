create index if not exists question_bank_events_user_id_idx
  on public.question_bank_events (user_id)
  where user_id is not null;

create index if not exists question_bank_events_quiz_session_id_idx
  on public.question_bank_events (quiz_session_id)
  where quiz_session_id is not null;
