WITH agg AS (
  SELECT resource_id, string_agg(content, '' ORDER BY chunk_index) as combined
  FROM meb_chunks
  WHERE resource_id IN (
    'c9491f2f-04d9-4f39-bef1-a1cf6bd05b4d',
    '8848d935-60fa-4dde-a6c4-e650f1d6baf5',
    '569a17c2-c8df-447c-ab14-411f86d06a92'
  )
  GROUP BY resource_id
)
UPDATE meb_resources r SET raw_text = agg.combined
FROM agg WHERE r.id = agg.resource_id;
