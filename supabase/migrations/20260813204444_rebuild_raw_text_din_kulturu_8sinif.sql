WITH agg AS (
  SELECT resource_id, string_agg(content, '' ORDER BY chunk_index) as combined
  FROM meb_chunks
  WHERE resource_id IN ('04d3eb32-cae6-421e-9f85-2c05986ca23c','93556502-582d-46a6-acd3-752b46f79152','f3360636-d1a6-41a1-958f-d60d56e59d4e','dfbd9073-c072-442d-b65e-c1f833d62178','6b67a7b3-66f3-4a8e-8aab-7384aa645c8b')
  GROUP BY resource_id
)
UPDATE meb_resources r SET raw_text = agg.combined
FROM agg WHERE r.id = agg.resource_id;
