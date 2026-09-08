-- MEB 2024 / TYMM 5. sınıf Matematik kanonik tema zincirleri.
-- Eski/yanlış etiketli düğümler geçmiş Learning Event bağlantılarını korumak için silinmez.

WITH canonical_topics(label, unit_label, source_reference) AS (
  VALUES
    ('1. Tema: Sayılar ve Nicelikler (1)', 'Sayılar ve Nicelikler (1): Doğal Sayılar ve İşlemler', 'https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/447'),
    ('1. Tema: Sayılar ve Nicelikler (2)', 'Sayılar ve Nicelikler (2): Kesirler', 'https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/449'),
    ('2. Tema: İşlemlerle Cebirsel Düşünme', 'İşlemlerle Cebirsel Düşünme', 'https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/450'),
    ('3. Tema: Geometrik Şekiller', 'Geometrik Şekiller', 'https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/448'),
    ('4. Tema: Geometrik Nicelikler', 'Geometrik Nicelikler', 'https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/451'),
    ('5. Tema: İstatistiksel Araştırma Süreci', 'İstatistiksel Araştırma Süreci', 'https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/452'),
    ('6. Tema: Veriden Olasılığa', 'Veriden Olasılığa', 'https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/455')
)
INSERT INTO public.learning_graph_nodes
  (node_key, node_type, label, subject, grade, level, source_type, metadata, is_active)
SELECT
  'topic:meb-2024:ortaokul:5:matematik:' || md5(lower(t.label)),
  'topic', t.label, 'Matematik', '5. sınıf', 'ortaokul', 'meb',
  jsonb_build_object(
    'catalog_version', 'meb-2024',
    'verification_status', 'verified',
    'source_reference', t.source_reference,
    'unit_label', t.unit_label
  ),
  true
FROM canonical_topics t
WHERE NOT EXISTS (
  SELECT 1 FROM public.learning_graph_nodes existing
  WHERE existing.node_type = 'topic'
    AND lower(existing.label) = lower(t.label)
    AND lower(existing.subject) = lower('Matematik')
    AND public.canonical_learning_grade(existing.grade) = public.canonical_learning_grade('5. sınıf')
)
ON CONFLICT (node_key) DO UPDATE SET
  label = EXCLUDED.label,
  subject = EXCLUDED.subject,
  grade = EXCLUDED.grade,
  level = EXCLUDED.level,
  source_type = EXCLUDED.source_type,
  metadata = public.learning_graph_nodes.metadata || EXCLUDED.metadata,
  is_active = true,
  updated_at = now();

WITH canonical_topics(label, unit_label) AS (
  VALUES
    ('1. Tema: Sayılar ve Nicelikler (1)', 'Sayılar ve Nicelikler (1): Doğal Sayılar ve İşlemler'),
    ('1. Tema: Sayılar ve Nicelikler (2)', 'Sayılar ve Nicelikler (2): Kesirler'),
    ('2. Tema: İşlemlerle Cebirsel Düşünme', 'İşlemlerle Cebirsel Düşünme'),
    ('3. Tema: Geometrik Şekiller', 'Geometrik Şekiller'),
    ('4. Tema: Geometrik Nicelikler', 'Geometrik Nicelikler'),
    ('5. Tema: İstatistiksel Araştırma Süreci', 'İstatistiksel Araştırma Süreci'),
    ('6. Tema: Veriden Olasılığa', 'Veriden Olasılığa')
)
INSERT INTO public.learning_graph_edges
  (source_node_id, target_node_id, edge_type, confidence, rationale, source_type, is_verified)
SELECT topic.id, unit.id, 'part_of', 1.000,
  'MEB 2024 TYMM resmi 5. sınıf Matematik tema bağlantısı', 'meb', true
FROM canonical_topics t
JOIN LATERAL (
  SELECT n.id
  FROM public.learning_graph_nodes n
  WHERE n.node_type = 'topic' AND lower(n.label) = lower(t.label)
    AND lower(n.subject) = lower('Matematik')
    AND public.canonical_learning_grade(n.grade) = public.canonical_learning_grade('5. sınıf')
    AND n.is_active = true
  ORDER BY (n.source_type = 'meb') DESC, n.created_at
  LIMIT 1
) topic ON true
JOIN public.learning_graph_nodes unit
  ON unit.node_type = 'unit'
 AND lower(unit.subject) = lower('Matematik')
 AND public.canonical_learning_grade(unit.grade) = public.canonical_learning_grade('5. sınıf')
 AND lower(unit.label) = lower(t.unit_label)
 AND unit.is_active = true
ON CONFLICT (source_node_id, target_node_id, edge_type) DO UPDATE SET
  confidence = 1.000,
  rationale = EXCLUDED.rationale,
  source_type = EXCLUDED.source_type,
  is_verified = true,
  updated_at = now();

DO $$
DECLARE v_target_count integer;
BEGIN
  SELECT count(DISTINCT lower(topic)) INTO v_target_count
  FROM public.learning_objective_publish_targets
  WHERE lower(subject) = lower('Matematik')
    AND public.canonical_learning_grade(grade) = public.canonical_learning_grade('5. sınıf')
    AND topic IN (
      '1. Tema: Sayılar ve Nicelikler (1)',
      '1. Tema: Sayılar ve Nicelikler (2)',
      '2. Tema: İşlemlerle Cebirsel Düşünme',
      '3. Tema: Geometrik Şekiller',
      '4. Tema: Geometrik Nicelikler',
      '5. Tema: İstatistiksel Araştırma Süreci',
      '6. Tema: Veriden Olasılığa'
    );
  IF v_target_count <> 7 THEN
    RAISE EXCEPTION 'Expected 7 canonical Grade 5 Mathematics publish targets, found %', v_target_count;
  END IF;
END $$;
