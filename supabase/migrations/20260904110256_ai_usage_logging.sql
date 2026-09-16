CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  operation     TEXT NOT NULL,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(12, 8) NOT NULL DEFAULT 0,
  user_id       UUID,
  quiz_session_id UUID,
  meta          JSONB,
  duration_ms   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created   ON ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_operation ON ai_usage_logs (operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model     ON ai_usage_logs (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user      ON ai_usage_logs (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_usage_no_public_access" ON ai_usage_logs;
CREATE POLICY "ai_usage_no_public_access" ON ai_usage_logs
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE VIEW ai_usage_daily_summary AS
SELECT
  date_trunc('day', created_at) AS day,
  operation,
  model,
  count(*)              AS call_count,
  sum(input_tokens)     AS total_input_tokens,
  sum(output_tokens)    AS total_output_tokens,
  sum(cost_usd)         AS total_cost_usd,
  avg(duration_ms)::int AS avg_duration_ms
FROM ai_usage_logs
GROUP BY 1, 2, 3;
