-- Follow-up for the Learning Graph v1 performance advisor.
CREATE INDEX IF NOT EXISTS learning_graph_edges_reviewed_by_idx
  ON public.learning_graph_edges (reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS topic_prerequisites_draft_reviewed_by_idx
  ON public.topic_prerequisites_draft (reviewed_by)
  WHERE reviewed_by IS NOT NULL;
