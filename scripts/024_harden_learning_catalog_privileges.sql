-- Explicit least-privilege grants for the exposed public schema.
-- RLS already hides unverified objectives; anon does not need table access.

REVOKE ALL ON public.learning_objective_catalog FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.learning_objective_catalog TO authenticated;
GRANT ALL ON public.learning_objective_catalog TO service_role;

REVOKE ALL ON public.learning_content_node_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.learning_catalog_review_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_content_node_mappings, public.learning_catalog_review_queue TO service_role;
