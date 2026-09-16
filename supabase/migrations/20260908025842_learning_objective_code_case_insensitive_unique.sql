CREATE UNIQUE INDEX IF NOT EXISTS learning_objective_catalog_code_ci_unique_idx
  ON public.learning_objective_catalog (lower(objective_code));
