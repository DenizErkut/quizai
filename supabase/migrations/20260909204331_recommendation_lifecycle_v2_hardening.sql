-- Cover lifecycle audit joins and deferred wake-up scans.
CREATE INDEX IF NOT EXISTS recommendation_lifecycle_actor_idx
  ON public.recommendation_lifecycle_events (actor_id)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_recommendations_deferred_due_idx
  ON public.student_recommendations (student_id, deferred_until)
  WHERE status = 'deferred';
