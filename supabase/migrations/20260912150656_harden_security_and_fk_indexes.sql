-- Close unintended RPC access while preserving the authenticated dashboard RPC.
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.notify_open_ended_assignment() FROM PUBLIC, anon, authenticated;

-- Evaluate auth.uid() once per statement instead of once per row.
DROP POLICY IF EXISTS error_reports_select_own ON public.error_reports;
CREATE POLICY error_reports_select_own ON public.error_reports
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS notification_preferences_self ON public.notification_preferences;
CREATE POLICY notification_preferences_self ON public.notification_preferences
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS topic_prereq_draft_admin_all ON public.topic_prerequisites_draft;
CREATE POLICY topic_prereq_draft_admin_all ON public.topic_prerequisites_draft
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid()) AND profiles.is_admin = true
  ));

-- Cover foreign keys used by joins, deletes and referential-integrity checks.
CREATE INDEX IF NOT EXISTS adaptive_teacher_overrides_classroom_id_idx ON public.adaptive_teacher_overrides(classroom_id);
CREATE INDEX IF NOT EXISTS agent_action_approval_queue_classroom_id_idx ON public.agent_action_approval_queue(classroom_id);
CREATE INDEX IF NOT EXISTS agent_action_approval_queue_reviewed_by_idx ON public.agent_action_approval_queue(reviewed_by);
CREATE INDEX IF NOT EXISTS agent_action_approval_queue_student_id_idx ON public.agent_action_approval_queue(student_id);
CREATE INDEX IF NOT EXISTS ai_shadow_evaluations_quiz_session_id_idx ON public.ai_shadow_evaluations(quiz_session_id);
CREATE INDEX IF NOT EXISTS ai_shadow_evaluations_user_id_idx ON public.ai_shadow_evaluations(user_id);
CREATE INDEX IF NOT EXISTS curriculum_versions_activated_by_idx ON public.curriculum_versions(activated_by);
CREATE INDEX IF NOT EXISTS curriculum_versions_created_by_idx ON public.curriculum_versions(created_by);
CREATE INDEX IF NOT EXISTS learning_catalog_review_audit_reviewer_id_idx ON public.learning_catalog_review_audit(reviewer_id);
CREATE INDEX IF NOT EXISTS learning_graph_edge_history_reviewed_by_idx ON public.learning_graph_edge_history(reviewed_by);
CREATE INDEX IF NOT EXISTS learning_objective_catalog_current_revision_id_idx ON public.learning_objective_catalog(current_revision_id);
CREATE INDEX IF NOT EXISTS learning_objective_import_batches_curriculum_version_id_idx ON public.learning_objective_import_batches(curriculum_version_id);
CREATE INDEX IF NOT EXISTS learning_objective_import_items_reviewed_by_idx ON public.learning_objective_import_items(reviewed_by);
CREATE INDEX IF NOT EXISTS learning_objective_import_items_selected_topic_node_id_idx ON public.learning_objective_import_items(selected_topic_node_id);
CREATE INDEX IF NOT EXISTS learning_objective_lifecycle_audit_actor_id_idx ON public.learning_objective_lifecycle_audit(actor_id);
CREATE INDEX IF NOT EXISTS learning_objective_review_audit_actor_id_idx ON public.learning_objective_review_audit(actor_id);
CREATE INDEX IF NOT EXISTS learning_objective_review_audit_batch_id_idx ON public.learning_objective_review_audit(batch_id);
CREATE INDEX IF NOT EXISTS learning_objective_revisions_created_by_idx ON public.learning_objective_revisions(created_by);
CREATE INDEX IF NOT EXISTS learning_objective_revisions_topic_node_id_idx ON public.learning_objective_revisions(topic_node_id);
CREATE INDEX IF NOT EXISTS learning_risk_actions_classroom_id_idx ON public.learning_risk_actions(classroom_id);
CREATE INDEX IF NOT EXISTS misconception_aliases_created_by_idx ON public.misconception_aliases(created_by);
CREATE INDEX IF NOT EXISTS misconception_catalog_reviewed_by_idx ON public.misconception_catalog(reviewed_by);
CREATE INDEX IF NOT EXISTS misconception_counter_evidence_misconception_id_idx ON public.misconception_counter_evidence(misconception_id);
CREATE INDEX IF NOT EXISTS misconception_counter_evidence_session_id_idx ON public.misconception_counter_evidence(session_id);
CREATE INDEX IF NOT EXISTS misconception_review_audit_reviewed_by_idx ON public.misconception_review_audit(reviewed_by);
CREATE INDEX IF NOT EXISTS recommendation_impact_measurements_quiz_session_id_idx ON public.recommendation_impact_measurements(quiz_session_id);
CREATE INDEX IF NOT EXISTS student_recommendations_last_applied_session_id_idx ON public.student_recommendations(last_applied_session_id);
CREATE INDEX IF NOT EXISTS subscriptions_seller_id_idx ON public.subscriptions(seller_id);
