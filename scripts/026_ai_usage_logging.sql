-- 026_ai_usage_logging.sql
-- 3 Eylül 2026 — P3: Gerçek token/maliyet ölçümü.
-- Şimdiye kadar hiçbir AI çağrısında token tüketimi loglanmıyordu; tüm
-- maliyet analizleri statik kod tahminine dayanıyordu. Bu tablo, her AI
-- çağrısının gerçek input/output token sayısını ve hesaplanmış USD
-- maliyetini kaydeder. Böylece "test üretimi başına gerçek maliyet",
-- "öğrenci başına aylık maliyet", "en pahalı endpoint" gibi sorular
-- tahminle değil, ölçülen veriyle yanıtlanabilir.

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Hangi endpoint/işlem (ör. 'generate-quiz', 'verify-questions:gpt4o')
  operation     TEXT NOT NULL,
  -- Hangi sağlayıcı/model (ör. 'anthropic:claude-sonnet-4-5', 'openai:gpt-4o', 'google:gemini-2.0-flash')
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  -- Gerçek token sayıları (sağlayıcının usage alanından)
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  -- Prompt caching kullanılırsa (şimdilik 0; P0'da devreye girince dolacak)
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  -- Hesaplanmış maliyet (USD) — fiyatlar helper'da tanımlı
  cost_usd      NUMERIC(12, 8) NOT NULL DEFAULT 0,
  -- İsteğe bağlı bağlam: hangi kullanıcı, hangi oturum, kaç soru vb.
  user_id       UUID,
  quiz_session_id UUID,
  meta          JSONB,
  -- Çağrı süresi (ms) — performans analizi için opsiyonel
  duration_ms   INTEGER
);

-- Analiz sorguları için indeksler
CREATE INDEX IF NOT EXISTS idx_ai_usage_created   ON ai_usage_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_operation ON ai_usage_logs (operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model     ON ai_usage_logs (model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user      ON ai_usage_logs (user_id) WHERE user_id IS NOT NULL;

-- RLS: bu tablo yalnızca sunucu (service role) tarafından yazılır ve
-- yalnızca adminlerce okunur. Normal kullanıcılar erişemez.
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Not: service_role RLS'i bypass eder, bu yüzden sunucu-taraflı insert'ler
-- (helper üzerinden) her zaman çalışır. Aşağıdaki policy yalnızca
-- authenticated kullanıcıların (ör. admin panelden) okumasını kısıtlar.
-- Admin kontrolü uygulama katmanında yapıldığı için burada geniş bir
-- SELECT policy'si yerine, hiçbir anon/authenticated erişimi verMİYORUZ;
-- veriye yalnızca service_role veya admin API route'ları erişir.
DROP POLICY IF EXISTS "ai_usage_no_public_access" ON ai_usage_logs;
CREATE POLICY "ai_usage_no_public_access" ON ai_usage_logs
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Özet görünüm: operation + model bazında günlük toplam (admin analizleri için)
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
