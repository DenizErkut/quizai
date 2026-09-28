create index if not exists education_eval_ai_items_resource_idx
  on public.education_eval_ai_question_items (source_resource_id);

create index if not exists education_eval_ai_items_objective_idx
  on public.education_eval_ai_question_items (objective_id)
  where objective_id is not null;

create index if not exists education_eval_ai_items_added_by_idx
  on public.education_eval_ai_question_items (added_by)
  where added_by is not null;
