-- Cover prerequisite workflow foreign keys used by admin lists and deletes.
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_packages_curriculum_idx
  ON public.learning_graph_prerequisite_packages(curriculum_version_id);
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_packages_created_by_idx
  ON public.learning_graph_prerequisite_packages(created_by);
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_packages_published_by_idx
  ON public.learning_graph_prerequisite_packages(published_by) WHERE published_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_items_source_idx
  ON public.learning_graph_prerequisite_items(source_node_id);
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_items_target_idx
  ON public.learning_graph_prerequisite_items(target_node_id);
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_items_reviewer_idx
  ON public.learning_graph_prerequisite_items(reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS learning_graph_prerequisite_items_edge_idx
  ON public.learning_graph_prerequisite_items(edge_id) WHERE edge_id IS NOT NULL;
