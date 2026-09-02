-- One-time canonicalization for Learning Events created before migration 019.
-- Original labels are retained in metadata; quiz_sessions remain untouched.

WITH resolved AS (
  SELECT e.id, e.topic old_topic, e.subject old_subject,
    d.topic new_topic, d.subject new_subject
  FROM public.learning_events e
  CROSS JOIN LATERAL public.resolve_learning_dimension(e.topic, e.subject) d
)
UPDATE public.learning_events e SET
  topic = r.new_topic,
  subject = r.new_subject,
  metadata = coalesce(e.metadata, '{}'::jsonb)
    || CASE WHEN r.old_topic IS DISTINCT FROM r.new_topic
      THEN jsonb_build_object('original_topic', r.old_topic) ELSE '{}'::jsonb END
    || CASE WHEN r.old_subject IS DISTINCT FROM r.new_subject
      THEN jsonb_build_object('original_subject', r.old_subject) ELSE '{}'::jsonb END
FROM resolved r
WHERE e.id = r.id
  AND (r.old_topic IS DISTINCT FROM r.new_topic
    OR r.old_subject IS DISTINCT FROM r.new_subject);

WITH resolved AS (
  SELECT c.id, d.topic, d.subject
  FROM public.misconception_catalog c
  CROSS JOIN LATERAL public.resolve_learning_dimension(c.topic, c.subject) d
)
UPDATE public.misconception_catalog c
SET topic = r.topic, subject = r.subject, updated_at = now()
FROM resolved r WHERE c.id = r.id
  AND (c.topic IS DISTINCT FROM r.topic OR c.subject IS DISTINCT FROM r.subject);

WITH resolved AS (
  SELECT sm.student_id, sm.misconception_id, d.topic, d.subject
  FROM public.student_misconceptions sm
  CROSS JOIN LATERAL public.resolve_learning_dimension(sm.topic, sm.subject) d
)
UPDATE public.student_misconceptions sm
SET topic = r.topic, subject = r.subject, updated_at = now()
FROM resolved r
WHERE sm.student_id = r.student_id AND sm.misconception_id = r.misconception_id
  AND (sm.topic IS DISTINCT FROM r.topic OR sm.subject IS DISTINCT FROM r.subject);

DO $$
DECLARE sid uuid;
BEGIN
  FOR sid IN SELECT DISTINCT student_id FROM public.learning_events LOOP
    PERFORM public.rebuild_student_mastery_v1(sid);
    PERFORM public.refresh_student_learning_profile(sid);
    PERFORM public.refresh_student_recommendations(sid);
  END LOOP;
END;
$$;
