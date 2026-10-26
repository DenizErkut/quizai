// lib/ai-pricing.ts — model fiyat tablosu ve maliyet hesabı (saf fonksiyonlar; DB/Supabase bağımlılığı yok).

// ─────────────────────────────────────────────────────────────────────────
// Model fiyatları — USD / 1M token (Eylül 2026, web'den doğrulandı).
// Fiyatlar değişirse SADECE burası güncellenir; tüm maliyet hesabı buradan.
// cacheRead: cache'den okunan input token fiyatı (~standart input'un %10'u).
// ─────────────────────────────────────────────────────────────────────────
type Price = { input: number; output: number; cacheRead: number; cacheWrite: number }
type PricePeriod = Price & { version: string; from: string; until?: string }

const PRICES: Record<string, Price> = {
  // Anthropic
  // 23 Eylül 2026 — kodda henüz hiçbir çağrı noktası claude-opus-*/claude-sonnet-5
  // kullanmıyor (route'lar claude-sonnet-5-5/haiku-4-5 kullanıyor). Ancak
  // lib/ai-gateway/model-registry.ts'deki `claudePremium` girişi
  // process.env.ANTHROPIC_PREMIUM_MODEL ile bu modellerden birine
  // ENV DEĞİŞKENİYLE geçirilebiliyor — o zaman burada fiyat kaydı
  // olmazsa maliyet sessizce 0 loglanır. Fiyatlar platform.claude.com
  // ve Anthropic'in resmi Opus 5.5 duyurusundan (anthropic.com/claude-opus-5-5)
  // doğrulanmıştır.
  'claude-opus-5-5':            { input: 4.0,  output: 20.0, cacheRead: 0.20, cacheWrite: 5.0  },
  'claude-opus-5':               { input: 5.0,  output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-4-8':             { input: 5.0,  output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-4-7':             { input: 5.0,  output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-4-6':             { input: 5.0,  output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  'claude-opus-4-5':             { input: 5.0,  output: 25.0, cacheRead: 0.50, cacheWrite: 6.25 },
  // 9 Ekim 2026 — tüm Sonnet çağrıları claude-sonnet-5-5'e taşındı (Sonnet 4.5, 30 Kasım 2026'da kapanıyor).
  // 4.5 kaydı geçmiş log satırlarını doğru fiyatlandırmak için duruyor.
  'claude-sonnet-5-5':           { input: 2.0,  output: 10.0, cacheRead: 0.20, cacheWrite: 2.50 },
  'claude-sonnet-5':             { input: 2.0,  output: 10.0, cacheRead: 0.20, cacheWrite: 2.50 },
  'claude-sonnet-4-6':           { input: 3.0,  output: 15.0, cacheRead: 0.30, cacheWrite: 3.75 },
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
  // Mistral Large 3 — resmi Mistral API fiyatı, 8 Eylül 2026.
  'mistral-large-latest':       { input: 0.50, output: 1.50, cacheRead: 0.05, cacheWrite: 0 },
  // Mistral Small 4 — 21 Ekim 2026: Mistral konsolundaki Usage → Cost ekranıyla (mistral-small-2603,
  // global/standard) doğrulandı: giriş 0,15 $, çıkış 0,60 $, önbellekten okuma ~0,015 $ / 1M token.
  'mistral-small-latest':       { input: 0.15, output: 0.60, cacheRead: 0.015, cacheWrite: 0 },
  // Google
  // Google — 6 Eylül 2026: 'gemini-2.0-flash' Google tarafından KALDIRILDI
  // (404 "no longer available"), tüm çağrı noktaları 'gemini-3.6-flash'e
  // güncellendi. Eski kayıt, geçmiş log satırlarını doğru fiyatlandırmak
  // için (model adı geriye dönük değişmez) korunuyor — yeni çağrılar hiç
  // bu anahtarı kullanmayacak.
  'gemini-2.0-flash':           { input: 0.10, output: 0.40, cacheRead: 0.025, cacheWrite: 0 }, // ESKİ/KALDIRILDI, sadece geçmiş kayıtlar için
}

// Bazı sağlayıcılar geçici/promosyon fiyat uygular. Sabit bir fiyatı geçmişe
// ve geleceğe taşımak yerine çağrının gerçekleştiği tarihe göre fiyat seçilir.
const PERIOD_PRICES: Record<string, PricePeriod[]> = {
  'gemini-3.6-flash': [
    { version: 'google-promo-through-2026-12-31', from: '2026-01-01T00:00:00.000Z', until: '2027-01-01T00:00:00.000Z', input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0 },
    { version: 'google-standard-from-2027-01-01', from: '2027-01-01T00:00:00.000Z', input: 1.50, output: 7.50, cacheRead: 0.15, cacheWrite: 0 },
  ],
}

const PRICE_VERSIONS: Record<string, string> = {
  'mistral-small-latest': 'mistral-small-official-2026-10',
}

// Fiyat listesinde olmayan bir model gelirse maliyeti 0 loglanır ama token
// yine kaydedilir (sonradan fiyat eklenip yeniden hesaplanabilir).
export function priceFor(model: string, occurredAt: Date): { price: Price; version: string } | null {
  const timestamp = occurredAt.getTime()
  const period = PERIOD_PRICES[model]?.find(p =>
    timestamp >= new Date(p.from).getTime() && (!p.until || timestamp < new Date(p.until).getTime())
  )
  if (period) return { price: period, version: period.version }
  const price = PRICES[model]
  return price ? { price, version: PRICE_VERSIONS[model] || 'static-2026-09' } : null
}

export interface AIUsageInput {
  operation: string            // 'generate-quiz', 'verify-questions:gpt4o' vb.
  provider: 'anthropic' | 'openai' | 'google' | 'mistral'
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  userId?: string | null
  quizSessionId?: string | null
  requestId?: string | null
  occurredAt?: Date
  durationMs?: number
  meta?: Record<string, unknown>
}

// Maliyeti USD olarak hesapla (token sayısı / 1e6 * fiyat)
export function computeCostUsd(u: AIUsageInput): number {
  const resolved = priceFor(u.model, u.occurredAt || new Date())
  if (!resolved) return 0
  const p = resolved.price
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

