create index if not exists learning_objective_import_batches_creator_idx on public.learning_objective_import_batches (created_by);
create index if not exists learning_objective_import_items_objective_idx on public.learning_objective_import_items (objective_id) where objective_id is not null;
