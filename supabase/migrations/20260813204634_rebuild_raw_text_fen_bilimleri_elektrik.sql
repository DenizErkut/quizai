WITH agg AS (
  SELECT resource_id, string_agg(content, '' ORDER BY chunk_index) as combined
  FROM meb_chunks
  WHERE resource_id IN ('5f7bd147-6e48-4142-bcf4-2240027f32a6','7b11b42c-9442-4052-aa99-3ab74161e71a')
  GROUP BY resource_id
)
UPDATE meb_resources r SET raw_text = agg.combined
FROM agg WHERE r.id = agg.resource_id;
