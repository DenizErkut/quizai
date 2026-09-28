-- Explicit deny policies document that browser roles cannot access eval data.
-- Admin server routes use service_role; it bypasses RLS and is never sent to clients.
CREATE POLICY education_eval_benchmark_sets_deny_client
  ON public.education_eval_benchmark_sets
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY education_eval_benchmark_items_deny_client
  ON public.education_eval_benchmark_items
  FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
