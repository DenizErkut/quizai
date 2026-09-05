// lib/ai-usage.ts
// 3 Eylül 2026 — P3: Gerçek token/maliyet ölçümü için merkezi loglama.
//
// Amaç: Şimdiye kadar hiçbir AI çağrısında token tüketimi ölçülmüyordu;
// tüm maliyet analizleri statik kod tahminine dayanıyordu. Bu helper, her
// AI çağrısının GERÇEK input/output token sayısını alır, güncel model
// fiyatlarıyla USD maliyeti hesaplar, hem Vercel loglarına yazar hem de
// (best-effort) ai_usage_logs tablosuna kaydeder.
//
// Tasarım ilkeleri:
//  - ASLA ana akışı bozmaz: loglama başarısız olursa sessizce yutar
//    (try/catch). Bir öğrenci, loglama DB'si erişilemez diye testsiz
//    kalmamalı.
//  - Fire-and-forget: DB insert'i await EDİLMEDEN çağrılabilir (çağıran
//    isterse await eder). Yanıt gecikmesine katkısı ~0.
//  - Sağlayıcı-agnostik: Anthropic, OpenAI ve Gemini usage formatlarını
//    normalize eden yardımcılar içerir.

import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────
// Model fiyatları — USD / 1M token (Eylül 2026, web'den doğrulandı).
// Fiyatlar değişirse SADECE burası güncellenir; tüm maliyet hesabı buradan.
// cacheRead: cache'den okunan input token fiyatı (~standart input'un %10'u).
// ─────────────────────────────────────────────────────────────────────────
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }

const PRICES: Record<string, Price> = {
  // Anthropic
  'claude-sonnet-4-5':          { input: 3.0,  output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
  'claude-haiku-4-5-20251001':  { input: 1.0,  output: 5.0,  cacheRead: 0.10, cacheWrite: 1.25 },
  // OpenAI
  // 5 Eylül 2026 — fiyatlar web'den doğrulanarak güncellendi. Eski GPT-4o
  // fiyatı ($5/$20) GÜNCEL DEĞİLDİ — gerçek güncel fiyat $2.50/$10
  // (cache'li input $1.25). Bu, o zamana kadarki TÜM GPT-4o maliyet
  // takibini (verify-questions:gpt4o) yaklaşık 2 KAT ŞİŞİRMİŞTİ. Ayrıca
  // OpenAI'nin GPT-4o'yu "legacy" ilan edip GPT-4.1/GPT-5 ailesini önerdiği
  // ve bunların HEM daha ucuz HEM daha yüksek cache indirimi (%75-90)
  // sunduğu görüldü — bu modeller ileride karşılaştırma/geçiş
  // değerlendirmesi için tabloya eklendi.
  'gpt-4o':                     { input: 2.50, output: 10.00, cacheRead: 1.25,  cacheWrite: 0 },
  'gpt-4o-mini':                { input: 0.15, output: 0.60,  cacheRead: 0.075, cacheWrite: 0 },
  'gpt-4.1':                    { input: 2.00, output: 8.00,  cacheRead: 0.50,  cacheWrite: 0 },
  'gpt-4.1-mini':               { input: 0.40, output: 1.60,  cacheRead: 0.10,  cacheWrite: 0 },
  'gpt-4.1-nano':               { input: 0.10, output: 0.40,  cacheRead: 0.025, cacheWrite: 0 },
  'gpt-5':                      { input: 1.25, output: 10.00, cacheRead: 0.125, cacheWrite: 0 },
  'gpt-5-mini':                 { input: 0.25, output: 2.00,  cacheRead: 0.025, cacheWrite: 0 },
  // Google
  'gemini-2.0-flash':           { input: 0.10, output: 0.40, cacheRead: 0.025, cacheWrite: 0 },
}

// Fiyat listesinde olmayan bir model gelirse maliyeti 0 loglanır ama token
// yine kaydedilir (sonradan fiyat eklenip yeniden hesaplanabilir).
function priceFor(model: string): Price | null {
  return PRICES[model] || null
}

export interface AIUsageInput {
  operation: string            // 'generate-quiz', 'verify-questions:gpt4o' vb.
  provider: 'anthropic' | 'openai' | 'google'
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  userId?: string | null
  quizSessionId?: string | null
  durationMs?: number
  meta?: Record<string, any>
}

// Maliyeti USD olarak hesapla (token sayısı / 1e6 * fiyat)
export function computeCostUsd(u: AIUsageInput): number {
  const p = priceFor(u.model)
  if (!p) return 0
  const cacheRead = u.cacheReadTokens || 0
  const cacheWrite = u.cacheWriteTokens || 0
  // Not: input_tokens genellikle cache-read/write'ı İÇERMEZ (sağlayıcı ayrı
  // raporlar). Her kalem kendi fiyatıyla çarpılır.
  const cost =
    (u.inputTokens  / 1e6) * p.input +
    (u.outputTokens / 1e6) * p.output +
    (cacheRead      / 1e6) * p.cacheRead +
    (cacheWrite     / 1e6) * p.cacheWrite
  return Number(cost.toFixed(8))
}

// Ana loglama fonksiyonu. Hem console'a (Vercel logları) hem DB'ye yazar.
// DB yazımı best-effort'tur; hata olursa yutulur ve sadece console'a düşer.
export async function logAIUsage(u: AIUsageInput): Promise<void> {
  const cost = computeCostUsd(u)

  // 1) Her zaman Vercel loguna yaz — DB olmasa bile greplenebilir kanıt.
  //    Tek satır, kolay parse edilir bir format.
  console.log(
    `[ai-usage] op=${u.operation} model=${u.model} in=${u.inputTokens} out=${u.outputTokens}` +
    `${u.cacheReadTokens ? ` cacheR=${u.cacheReadTokens}` : ''}` +
    ` cost=$${cost.toFixed(6)}${u.durationMs ? ` ms=${u.durationMs}` : ''}`
  )

  // 2) DB'ye yaz (best-effort). Service role gerekir; yoksa sessizce atla.
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const sb = createClient(url, key)
    await sb.from('ai_usage_logs').insert({
      operation: u.operation,
      provider: u.provider,
      model: u.model,
      input_tokens: u.inputTokens,
      output_tokens: u.outputTokens,
      cache_read_tokens: u.cacheReadTokens || 0,
      cache_write_tokens: u.cacheWriteTokens || 0,
      cost_usd: cost,
      user_id: u.userId || null,
      quiz_session_id: u.quizSessionId || null,
      duration_ms: u.durationMs ?? null,
      meta: u.meta || null,
    })
  } catch (e: any) {
    // Loglama ASLA ana akışı bozmamalı. Sadece uyar, yut.
    console.warn(`[ai-usage] DB log başarısız (yutuldu): ${e?.message || e}`)
  }
}

// ── Sağlayıcı-özel yardımcılar: usage nesnesini normalize eder ──

// Anthropic messages.create() yanıtı → { input_tokens, output_tokens,
// cache_read_input_tokens?, cache_creation_input_tokens? }
export function logAnthropicUsage(
  operation: string,
  model: string,
  response: any,
  extra?: Partial<AIUsageInput>
): Promise<void> {
  const usage = response?.usage || {}
  return logAIUsage({
    operation,
    provider: 'anthropic',
    model,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cacheReadTokens: usage.cache_read_input_tokens || 0,
    cacheWriteTokens: usage.cache_creation_input_tokens || 0,
    ...extra,
  })
}

// OpenAI chat.completions yanıtı → { usage: { prompt_tokens,
// completion_tokens, prompt_tokens_details?: { cached_tokens } } }
export function logOpenAIUsage(
  operation: string,
  model: string,
  response: any,
  extra?: Partial<AIUsageInput>
): Promise<void> {
  const usage = response?.usage || {}
  const cached = usage.prompt_tokens_details?.cached_tokens || 0
  return logAIUsage({
    operation,
    provider: 'openai',
    model,
    // OpenAI prompt_tokens cache'li token'ları İÇERİR; ayrıştır.
    inputTokens: Math.max(0, (usage.prompt_tokens || 0) - cached),
    outputTokens: usage.completion_tokens || 0,
    cacheReadTokens: cached,
    ...extra,
  })
}

// Gemini generateContent yanıtı → { usageMetadata: {
// promptTokenCount, candidatesTokenCount } }
export function logGeminiUsage(
  operation: string,
  model: string,
  usageMetadata: any,
  extra?: Partial<AIUsageInput>
): Promise<void> {
  const u = usageMetadata || {}
  return logAIUsage({
    operation,
    provider: 'google',
    model,
    inputTokens: u.promptTokenCount || 0,
    outputTokens: u.candidatesTokenCount || 0,
    ...extra,
  })
}
