-- Misconception false-positive measurement v1
CREATE OR REPLACE VIEW public.misconception_false_positive_summary AS
WITH decisions AS (
  SELECT c.subject,c.topic,c.verification_status,
    coalesce(nullif(e.question_type,''),'unknown') question_type,
    count(distinct c.id)::integer item_count,
    count(*)::integer evidence_count
  FROM public.misconception_catalog c
  LEFT JOIN public.learning_events e ON e.misconception_id=c.id
  WHERE c.verification_status IN ('verified','rejected')
  GROUP BY c.subject,c.topic,c.verification_status,coalesce(nullif(e.question_type,''),'unknown')
), grouped AS (
  SELECT subject,topic,question_type,
    sum(item_count) FILTER(WHERE verification_status='verified')::integer verified_count,
    sum(item_count) FILTER(WHERE verification_status='rejected')::integer rejected_count,
    sum(evidence_count) FILTER(WHERE verification_status='verified')::integer verified_evidence,
    sum(evidence_count) FILTER(WHERE verification_status='rejected')::integer rejected_evidence
  FROM decisions GROUP BY subject,topic,question_type
)
SELECT subject,topic,question_type,coalesce(verified_count,0) verified_count,
  coalesce(rejected_count,0) rejected_count,coalesce(verified_evidence,0) verified_evidence,
  coalesce(rejected_evidence,0) rejected_evidence,
  round(100*coalesce(rejected_count,0)::numeric/nullif(coalesce(verified_count,0)+coalesce(rejected_count,0),0),2) false_positive_pct
FROM grouped;
REVOKE ALL ON public.misconception_false_positive_summary FROM anon,authenticated;
GRANT SELECT ON public.misconception_false_positive_summary TO service_role;
