WITH agg AS (
  SELECT resource_id, string_agg(content, '' ORDER BY chunk_index) as combined
  FROM meb_chunks
  WHERE resource_id IN ('0335a384-c55d-479b-b10f-72f46e2cf152','b15f3104-a440-4654-9a11-9a7d7549fedd')
  GROUP BY resource_id
)
UPDATE meb_resources r SET raw_text = agg.combined
FROM agg WHERE r.id = agg.resource_id;
