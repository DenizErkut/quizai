-- Keep legacy "Tam sayılar ve işlemler" events on the same learning
-- dimension as current Matematik / Tam Sayılar sessions.
INSERT INTO public.learning_topic_aliases
  (alias_key, canonical_topic, canonical_subject, review_status, notes)
VALUES
  (public.learning_dimension_key('Tam sayılar ve işlemler'), 'Tam Sayılar', 'Matematik', 'reviewed', 'Legacy topic label normalization')
ON CONFLICT (alias_key) DO UPDATE SET
  canonical_topic = EXCLUDED.canonical_topic,
  canonical_subject = EXCLUDED.canonical_subject,
  review_status = 'reviewed',
  notes = EXCLUDED.notes,
  updated_at = now();

WITH resolved AS (
  SELECT e.id, e.topic AS old_topic, e.subject AS old_subject,
         d.topic AS new_topic, d.subject AS new_subject
  FROM public.learning_events e
  CROSS JOIN LATERAL public.resolve_learning_dimension(e.topic, e.subject) d
  WHERE public.learning_dimension_key(e.topic) = public.learning_dimension_key('Tam sayılar ve işlemler')
)
UPDATE public.learning_events e
SET topic = r.new_topic,
    subject = r.new_subject,
    metadata = coalesce(e.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'canonicalized_at', now(),
        'original_topic', coalesce(e.metadata->>'original_topic', r.old_topic),
        'original_subject', coalesce(e.metadata->>'original_subject', r.old_subject)
      )
FROM resolved r
WHERE e.id = r.id
  AND (e.topic IS DISTINCT FROM r.new_topic OR e.subject IS DISTINCT FROM r.new_subject);

DO $$
DECLARE sid uuid;
BEGIN
  FOR sid IN
    SELECT DISTINCT student_id
    FROM public.learning_events
    WHERE topic = 'Tam Sayılar' AND subject = 'Matematik'
  LOOP
    PERFORM public.rebuild_student_mastery_v1(sid);
    PERFORM public.refresh_student_learning_profile(sid);
    PERFORM public.refresh_student_recommendations(sid);
  END LOOP;
END $$;
