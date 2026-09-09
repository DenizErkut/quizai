-- Provenance for AI-proposed prerequisite packages. Raw model output is never stored.
ALTER TABLE public.learning_graph_prerequisite_packages
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'expert'
    CHECK (source_kind IN ('expert','ai_suggestion')),
  ADD COLUMN IF NOT EXISTS ai_provider text,
  ADD COLUMN IF NOT EXISTS ai_model text,
  ADD COLUMN IF NOT EXISTS ai_policy_version text,
  ADD COLUMN IF NOT EXISTS ai_request_id uuid,
  ADD COLUMN IF NOT EXISTS proposed_count integer CHECK (proposed_count IS NULL OR proposed_count >= 0),
  ADD COLUMN IF NOT EXISTS dropped_count integer CHECK (dropped_count IS NULL OR dropped_count >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS learning_graph_prerequisite_packages_ai_request_idx
  ON public.learning_graph_prerequisite_packages(ai_request_id)
  WHERE ai_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_packages_source_kind_idx
  ON public.learning_graph_prerequisite_packages(source_kind, status, updated_at DESC);

COMMENT ON COLUMN public.learning_graph_prerequisite_packages.source_kind IS
  'Distinguishes human-authored packages from AI suggestions; both require the same expert review and cycle-checked publication.';
COMMENT ON COLUMN public.learning_graph_prerequisite_packages.ai_request_id IS
  'Trace identifier only. Raw AI prompts and responses are intentionally not persisted in this workflow.';
