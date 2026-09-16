WITH agg AS (
  SELECT resource_id, string_agg(content, '' ORDER BY chunk_index) as combined
  FROM meb_chunks
  WHERE resource_id IN (
    'd2f5cd32-7564-461e-b773-f6dce5d21662',
    '0f1f3392-fa6b-425a-9209-3fb188ac74bb',
    '5f3875c7-ca3b-4719-ac20-ce8feadc9644',
    'db465cb1-2d6b-4bb4-bc98-2386e726f11c'
  )
  GROUP BY resource_id
)
UPDATE meb_resources r SET raw_text = agg.combined
FROM agg WHERE r.id = agg.resource_id;
