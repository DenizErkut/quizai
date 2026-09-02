-- Reviewed legacy spelling/diacritic aliases discovered by the backfill audit.

INSERT INTO public.learning_topic_aliases
  (alias_key, canonical_topic, canonical_subject, review_status, notes)
VALUES
  (public.learning_dimension_key('Yasayan Demokrasimiz'), 'Yaşayan Demokrasimiz', 'Sosyal Bilgiler', 'reviewed', 'Türkçe karakter normalizasyonu'),
  (public.learning_dimension_key('Present continuous'), 'Present Continuous', 'İngilizce', 'reviewed', 'Açık ders eşlemesi'),
  (public.learning_dimension_key('Past simple tense'), 'Past Simple Tense', 'İngilizce', 'reviewed', 'Açık ders eşlemesi'),
  (public.learning_dimension_key('Ondalik sayilar'), 'Ondalık Sayılar', 'Matematik', 'reviewed', 'Türkçe karakter normalizasyonu'),
  (public.learning_dimension_key('Hucre ve organeller'), 'Hücre ve Organeller', 'Fen Bilimleri', 'reviewed', 'Türkçe karakter normalizasyonu'),
  (public.learning_dimension_key('Tam sayilar'), 'Tam Sayılar', 'Matematik', 'reviewed', 'Türkçe karakter normalizasyonu'),
  (public.learning_dimension_key('Osmanli tarihi'), 'Osmanlı Tarihi', 'Sosyal Bilgiler', 'reviewed', 'Türkçe karakter normalizasyonu'),
  (public.learning_dimension_key('osmanlı tarihi'), 'Osmanlı Tarihi', 'Sosyal Bilgiler', 'reviewed', 'Harf büyüklüğü normalizasyonu'),
  (public.learning_dimension_key('osmanlı kuruluşu'), 'Osmanlı Kuruluşu', 'Sosyal Bilgiler', 'reviewed', 'Harf büyüklüğü normalizasyonu'),
  (public.learning_dimension_key('Ortak Mirasımız'), 'Ortak Mirasımız', 'Sosyal Bilgiler', 'reviewed', 'Açık ders eşlemesi'),
  (public.learning_dimension_key('Sayılar ve Nicelikler (1)'), 'Sayılar ve Nicelikler (1)', 'Matematik', 'reviewed', 'Açık ders eşlemesi'),
  (public.learning_dimension_key('1. Ünite: Güneş Sistemi ve Tutulmalar'), '1. Ünite: Güneş Sistemi ve Tutulmalar', 'Fen Bilimleri', 'reviewed', 'Açık ders eşlemesi'),
  (public.learning_dimension_key('2. Ünite: Kuvvetin Etkisinde Hareket'), '2. Ünite: Kuvvetin Etkisinde Hareket', 'Fen Bilimleri', 'reviewed', 'Açık ders eşlemesi')
ON CONFLICT (alias_key) DO UPDATE SET
  canonical_topic = EXCLUDED.canonical_topic,
  canonical_subject = EXCLUDED.canonical_subject,
  review_status = EXCLUDED.review_status,
  notes = EXCLUDED.notes,
  updated_at = now();

WITH resolved AS (
  SELECT e.id, e.topic old_topic, e.subject old_subject, d.topic new_topic, d.subject new_subject
  FROM public.learning_events e
  CROSS JOIN LATERAL public.resolve_learning_dimension(e.topic, e.subject) d
)
UPDATE public.learning_events e SET
  topic = r.new_topic, subject = r.new_subject,
  metadata = coalesce(e.metadata, '{}'::jsonb)
    || CASE WHEN r.old_topic IS DISTINCT FROM r.new_topic
      THEN jsonb_build_object('original_topic', coalesce(e.metadata->>'original_topic', r.old_topic)) ELSE '{}'::jsonb END
    || CASE WHEN r.old_subject IS DISTINCT FROM r.new_subject
      THEN jsonb_build_object('original_subject', coalesce(e.metadata->>'original_subject', r.old_subject)) ELSE '{}'::jsonb END
FROM resolved r WHERE e.id = r.id
  AND (r.old_topic IS DISTINCT FROM r.new_topic OR r.old_subject IS DISTINCT FROM r.new_subject);

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
