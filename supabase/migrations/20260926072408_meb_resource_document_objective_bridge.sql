-- Keep edited MEB document text and its searchable chunks in sync atomically.
CREATE OR REPLACE FUNCTION public.update_meb_resource_document_v1(
  p_resource_id uuid,
  p_title text,
  p_grade text,
  p_subject text,
  p_unit text,
  p_level text,
  p_raw_text text,
  p_chunks jsonb
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_chunk_count integer;
BEGIN
  IF p_resource_id IS NULL
     OR char_length(btrim(coalesce(p_title, ''))) NOT BETWEEN 2 AND 300
     OR char_length(btrim(coalesce(p_grade, ''))) NOT BETWEEN 1 AND 80
     OR char_length(btrim(coalesce(p_subject, ''))) NOT BETWEEN 1 AND 120
     OR char_length(btrim(coalesce(p_unit, ''))) NOT BETWEEN 1 AND 180
     OR char_length(btrim(coalesce(p_level, ''))) NOT BETWEEN 1 AND 40
     OR char_length(coalesce(p_raw_text, '')) NOT BETWEEN 1 AND 500000
     OR p_chunks IS NULL
     OR jsonb_typeof(p_chunks) <> 'array'
     OR jsonb_array_length(p_chunks) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid MEB resource document payload';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_chunks) AS chunk(value)
    WHERE jsonb_typeof(chunk.value) <> 'string'
       OR char_length(btrim(chunk.value #>> '{}')) <= 100
       OR char_length(chunk.value #>> '{}') > 5000
  ) THEN
    RAISE EXCEPTION 'Invalid MEB resource chunk';
  END IF;

  UPDATE public.meb_resources
  SET title = btrim(p_title), grade = btrim(p_grade), subject = btrim(p_subject),
      unit = btrim(p_unit), level = btrim(p_level), raw_text = p_raw_text
  WHERE id = p_resource_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEB resource not found';
  END IF;

  DELETE FROM public.meb_chunks WHERE resource_id = p_resource_id;
  INSERT INTO public.meb_chunks (resource_id, chunk_index, content, embedding, grade, subject, unit, level)
  SELECT p_resource_id, (entry.ordinality - 1)::integer, entry.value #>> '{}', NULL,
      btrim(p_grade), btrim(p_subject), btrim(p_unit), btrim(p_level)
  FROM jsonb_array_elements(p_chunks) WITH ORDINALITY AS entry(value, ordinality);

  GET DIAGNOSTICS v_chunk_count = ROW_COUNT;
  RETURN v_chunk_count;
END;
$$;

REVOKE ALL ON FUNCTION public.update_meb_resource_document_v1(uuid, text, text, text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_meb_resource_document_v1(uuid, text, text, text, text, text, text, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.update_meb_resource_document_v1(uuid, text, text, text, text, text, text, jsonb) IS
  'Atomically updates an admin-edited MEB document transcript and rebuilds its keyword-search chunks.';
