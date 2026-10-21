// Mistral `usage` nesnesini maliyet için ayrıştırır. Mistral'in prompt_tokens değeri önbellekten
// okunan token'ları İÇERİR (konsolda ayrı satır: giriş / cached). Hepsini normal giriş fiyatıyla
// yazmak maliyeti fazla gösterir; bu yüzden önbellek payı ayrılır (OpenAI için lib/ai-usage.ts'teki gibi).
export function splitMistralUsage(usage: unknown): { promptTokens: number; inputTokens: number; outputTokens: number; cacheReadTokens: number } {
  const u = (usage && typeof usage === 'object' ? usage : {}) as Record<string, unknown>
  const promptTokens = Math.max(0, Number(u.prompt_tokens || 0))
  const details = (u.prompt_tokens_details ?? u.prompt_token_details) as { cached_tokens?: unknown } | undefined
  const cacheReadTokens = Math.min(promptTokens, Math.max(0, Number(details?.cached_tokens || 0)))
  return {
    promptTokens,
    inputTokens: promptTokens - cacheReadTokens,
    outputTokens: Math.max(0, Number(u.completion_tokens || 0)),
    cacheReadTokens,
  }
}
