-- 5 Eylül 2026 — GPT-4.1-mini pilotu için: hangi test hangi AI motoruyla
-- üretildi, sonradan kalite (skor, tamamlanma oranı, tekrar-oranı) ve
-- maliyet karşılaştırması yapabilmek için. NULL = Claude (mevcut/varsayılan
-- davranış, geriye dönük uyumlu). 'gpt-4.1-mini' = pilot motoru.
ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS gen_engine TEXT;
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_gen_engine ON quiz_sessions (gen_engine) WHERE gen_engine IS NOT NULL;
