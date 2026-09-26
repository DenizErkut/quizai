-- Connect legacy/UI topic labels to the active canonical MEB topic units.
-- These are reviewed, deterministic mappings; runtime never performs fuzzy/AI matching.
INSERT INTO public.learning_topic_aliases
  (alias_key, canonical_topic, canonical_subject, review_status, notes)
VALUES
  (public.learning_dimension_key('Fonksiyonlara giriş'), 'Nicelikler Ve Değişimler', 'Matematik', 'reviewed', 'Canonical 10. sınıf Matematik topic bridge; reviewed 2026-09-26'),
  (public.learning_dimension_key('Birinci dereceden fonksiyonlar'), 'Nicelikler Ve Değişimler', 'Matematik', 'reviewed', 'Canonical 10. sınıf Matematik topic bridge; reviewed 2026-09-26'),
  (public.learning_dimension_key('Rasyonel ifadeler'), 'Nicelikler Ve Değişimler', 'Matematik', 'reviewed', 'Canonical 10. sınıf Matematik topic bridge; reviewed 2026-09-26'),
  (public.learning_dimension_key('Trigonometriye giriş'), 'Geometrik Şekiller', 'Matematik', 'reviewed', 'Canonical 10. sınıf Matematik topic bridge; reviewed 2026-09-26')
ON CONFLICT (alias_key) DO UPDATE SET
  canonical_topic = EXCLUDED.canonical_topic,
  canonical_subject = EXCLUDED.canonical_subject,
  review_status = EXCLUDED.review_status,
  notes = EXCLUDED.notes,
  updated_at = now();

COMMENT ON TABLE public.learning_topic_aliases IS
  'Admin-reviewed imported/UI topic labels mapped to canonical curriculum topics; runtime uses only reviewed rows.';
