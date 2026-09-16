WITH agg AS (
  SELECT resource_id, string_agg(content, '' ORDER BY chunk_index) as combined
  FROM meb_chunks
  WHERE resource_id IN (
    '0ad7b71a-f2be-4921-810d-4a67751b4cb5',
    '4d1e0644-cd45-4e8d-a110-7539a795851a',
    '45012ea8-72ad-413d-9ed8-c9df8001c435',
    '7279e8f6-c3fc-4853-b337-238276efbbdb'
  )
  GROUP BY resource_id
)
UPDATE meb_resources r
SET raw_text = agg.combined
FROM agg
WHERE r.id = agg.resource_id;
