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

import { createClient } from '@/lib/supabase/server-create-client'

import { computeCostUsd, priceFor, type AIUsageInput } from './ai-pricing'

export { computeCostUsd, type AIUsageInput }

const warnedUnpriced = new Set<string>()

// Ana loglama fonksiyonu. Hem console'a (Vercel logları) hem DB'ye yazar.
// DB yazımı best-effort'tur; hata olursa yutulur ve sadece console'a düşer.
export async function logAIUsage(u: AIUsageInput): Promise<void> {
  const cost = computeCostUsd(u)
  const pricingVersion = priceFor(u.model, u.occurredAt || new Date())?.version || 'unknown'
  if (pricingVersion === 'unknown' && (u.inputTokens || u.outputTokens) && !warnedUnpriced.has(u.model)) {
    // Maliyet 0 olarak yazılır ama gerçek değil: pricing_version='unknown' satırlar toplamlara güvenilmemesi gerektiğini gösterir.
    warnedUnpriced.add(u.model)
    console.warn(`[ai-usage] fiyatı tanımsız model: ${u.model} — maliyet hesaplanamadı (0 yazıldı), fiyat tablosuna ekleyin`)
  }

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
    const { error } = await sb.from('ai_usage_logs').insert({
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
      request_id: u.requestId || null,
      pricing_version: pricingVersion,
      duration_ms: u.durationMs ?? null,
      meta: u.meta || null,
    })
    if (error) console.warn(`[ai-usage] DB log başarısız (yutuldu): ${error.message}`)
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
