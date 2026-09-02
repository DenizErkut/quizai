-- Curriculum stores grade as "5. sınıf" while MEB resources may store
-- "Ortaokul 5. sınıf" or "Ortaokul 8.sınıf". Canonical graph keys must
-- represent these as the same grade dimension.

CREATE OR REPLACE FUNCTION public.canonical_learning_grade(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, pg_temp
RETURN regexp_replace(
  regexp_replace(
    regexp_replace(lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g')),
      'sinif', 'sınıf', 'g'),
    '([0-9]+)\s*\.\s*sınıf', '\1. sınıf', 'g'),
  '^(ilk\s*okul|orta\s*okul|lise|üniversite|universite)\s+', ''
);

REVOKE ALL ON FUNCTION public.canonical_learning_grade(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonical_learning_grade(text) TO service_role;

-- These nodes are fully derived by pipeline v1 and can be rebuilt safely.
DELETE FROM public.learning_graph_nodes
WHERE node_type IN ('subject', 'unit')
  AND metadata->>'catalog_version' = 'v1';

SELECT * FROM public.sync_learning_catalog_v1();
