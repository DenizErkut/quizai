-- Controlled learning-objective import staging.
-- Imported records remain non-public candidates until a later explicit review step.

CREATE TABLE IF NOT EXISTS public.learning_objective_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('meb', 'manual', 'import')),
  source_reference text NOT NULL CHECK (char_length(btrim(source_reference)) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'validated', 'needs_correction', 'published', 'rejected')),
  total_count integer NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  valid_count integer NOT NULL DEFAULT 0 CHECK (valid_count >= 0),
  invalid_count integer NOT NULL DEFAULT 0 CHECK (invalid_count >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_objective_import_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.learning_objective_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  objective_code text,
  title text,
  level text,
  grade text,
  subject text,
  unit text,
  topic text,
  source_reference text,
  validation_status text NOT NULL DEFAULT 'pending'
    CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  objective_id uuid REFERENCES public.learning_objective_catalog(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_number)
);

CREATE INDEX IF NOT EXISTS learning_objective_import_batches_status_idx
  ON public.learning_objective_import_batches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS learning_objective_import_batches_creator_idx
  ON public.learning_objective_import_batches (created_by);
CREATE INDEX IF NOT EXISTS learning_objective_import_items_batch_status_idx
  ON public.learning_objective_import_items (batch_id, validation_status, row_number);
CREATE INDEX IF NOT EXISTS learning_objective_import_items_code_idx
  ON public.learning_objective_import_items (objective_code)
  WHERE objective_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS learning_objective_import_items_objective_idx
  ON public.learning_objective_import_items (objective_id)
  WHERE objective_id IS NOT NULL;

ALTER TABLE public.learning_objective_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_objective_import_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_objective_import_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.learning_objective_import_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_objective_import_batches TO service_role;
GRANT ALL ON public.learning_objective_import_items TO service_role;

CREATE OR REPLACE FUNCTION public.stage_learning_objective_import(
  p_source_type text,
  p_source_reference text,
  p_created_by uuid,
  p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id uuid;
  v_total integer;
  v_valid integer;
  v_invalid integer;
BEGIN
  IF p_source_type NOT IN ('meb', 'manual', 'import') THEN
    RAISE EXCEPTION 'source_type must be meb, manual or import';
  END IF;
  IF char_length(btrim(coalesce(p_source_reference, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'source_reference length must be between 3 and 500';
  END IF;
  IF p_created_by IS NULL THEN RAISE EXCEPTION 'created_by is required'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'rows must be a JSON array'; END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total < 1 OR v_total > 500 THEN
    RAISE EXCEPTION 'an import batch must contain between 1 and 500 rows';
  END IF;

  INSERT INTO public.learning_objective_import_batches
    (source_type, source_reference, created_by, total_count)
  VALUES (p_source_type, btrim(p_source_reference), p_created_by, v_total)
  RETURNING id INTO v_batch_id;

  INSERT INTO public.learning_objective_import_items
    (batch_id, row_number, objective_code, title, level, grade, subject,
     unit, topic, source_reference, raw_payload)
  SELECT v_batch_id, ordinality::integer,
    nullif(btrim(value->>'objective_code'), ''),
    nullif(regexp_replace(btrim(value->>'title'), '\s+', ' ', 'g'), ''),
    nullif(regexp_replace(btrim(value->>'level'), '\s+', ' ', 'g'), ''),
    nullif(public.canonical_learning_grade(value->>'grade'), ''),
    nullif(regexp_replace(btrim(value->>'subject'), '\s+', ' ', 'g'), ''),
    nullif(regexp_replace(btrim(value->>'unit'), '\s+', ' ', 'g'), ''),
    nullif(regexp_replace(btrim(value->>'topic'), '\s+', ' ', 'g'), ''),
    coalesce(nullif(btrim(value->>'source_reference'), ''), btrim(p_source_reference)),
    value
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS payload(value, ordinality);

  WITH validations AS (
    SELECT i.id,
      coalesce(jsonb_agg(checks.message) FILTER (WHERE checks.message IS NOT NULL), '[]'::jsonb) AS errors
    FROM public.learning_objective_import_items i
    CROSS JOIN LATERAL (VALUES
      (CASE WHEN i.objective_code IS NULL THEN 'objective_code zorunlu' END),
      (CASE WHEN i.objective_code IS NOT NULL AND char_length(i.objective_code) > 80 THEN 'objective_code en fazla 80 karakter olabilir' END),
      (CASE WHEN i.title IS NULL OR char_length(i.title) < 3 THEN 'title en az 3 karakter olmalı' END),
      (CASE WHEN i.level IS NULL THEN 'level zorunlu' END),
      (CASE WHEN i.grade IS NULL THEN 'grade zorunlu' END),
      (CASE WHEN i.subject IS NULL THEN 'subject zorunlu' END),
      (CASE WHEN i.unit IS NULL THEN 'unit zorunlu' END),
      (CASE WHEN i.topic IS NULL THEN 'topic zorunlu' END),
      (CASE WHEN EXISTS (
        SELECT 1 FROM public.learning_objective_catalog c
        WHERE lower(c.objective_code) = lower(i.objective_code)
      ) THEN 'objective_code katalogda zaten mevcut' END),
      (CASE WHEN i.objective_code IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.learning_objective_import_items d
        WHERE d.batch_id = i.batch_id AND d.id <> i.id
          AND lower(d.objective_code) = lower(i.objective_code)
      ) THEN 'objective_code bu dosyada birden fazla kez bulunuyor' END)
    ) AS checks(message)
    WHERE i.batch_id = v_batch_id
    GROUP BY i.id
  )
  UPDATE public.learning_objective_import_items i SET
    validation_errors = v.errors,
    validation_status = CASE WHEN jsonb_array_length(v.errors) = 0 THEN 'valid' ELSE 'invalid' END,
    updated_at = now()
  FROM validations v
  WHERE i.id = v.id;

  SELECT count(*) FILTER (WHERE validation_status = 'valid')::integer,
         count(*) FILTER (WHERE validation_status = 'invalid')::integer
  INTO v_valid, v_invalid
  FROM public.learning_objective_import_items WHERE batch_id = v_batch_id;

  UPDATE public.learning_objective_import_batches SET
    status = CASE WHEN v_invalid = 0 THEN 'validated' ELSE 'needs_correction' END,
    valid_count = v_valid, invalid_count = v_invalid, updated_at = now()
  WHERE id = v_batch_id;

  RETURN jsonb_build_object('batch_id', v_batch_id, 'status',
    CASE WHEN v_invalid = 0 THEN 'validated' ELSE 'needs_correction' END,
    'total_count', v_total, 'valid_count', v_valid, 'invalid_count', v_invalid);
END;
$$;

REVOKE ALL ON FUNCTION public.stage_learning_objective_import(text, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_learning_objective_import(text, text, uuid, jsonb)
  TO service_role;

COMMENT ON TABLE public.learning_objective_import_batches IS
  'Auditable staging batches for authoritative learning-objective imports; never student-visible before explicit publication.';
COMMENT ON FUNCTION public.stage_learning_objective_import(text, text, uuid, jsonb) IS
  'Validates and stages up to 500 authoritative objective rows without publishing them; service-role only.';
