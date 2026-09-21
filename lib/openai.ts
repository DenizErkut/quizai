// lib/openai.ts — OpenAI yardımcı fonksiyonları

import { logOpenAIUsage } from '@/lib/ai-usage'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!

// 16 Eylül 2026 — görsel üretiminde OpenAI yanıtı token sınırına takılıp
// yarıda kesildiğinde (finish_reason: 'length'), çağıran taraf bunu sıradan
// bir "kötü yanıt"tan ayırt edemiyordu; SVG'yi olduğu gibi (kapanış etiketi
// olmadan) alıp regex eşleşmesi başarısız oluyor, sebep hiçbir yerde
// görünmüyordu. requireComplete:true ile işaretlenen çağrılar artık kesilme
// durumunda bu özel hatayı fırlatıyor, böylece çağıran taraf "gerçekten
// kesildi mi yoksa model kötü mü cevap verdi" ayrımını yapıp buna göre
// (örn. daha yüksek token limitiyle) yeniden deneyebiliyor.
export class OpenAITruncatedError extends Error {
  constructor(message = 'OpenAI response truncated (finish_reason=length)') {
    super(message)
    this.name = 'OpenAITruncatedError'
  }
}

async function callOpenAI(messages: {role: string, content: any}[], options: {
  model?: string
  max_tokens?: number
  temperature?: number
  json?: boolean
  operation?: string   // 3 Eylül 2026 — token loglaması için işlem etiketi
  userId?: string
  quizSessionId?: string
  requestId?: string
  requireComplete?: boolean // finish_reason='length' olursa OpenAITruncatedError fırlat
  timeoutMs?: number        // 16 Eylül 2026 — sınırsız bekleyen fetch, zaman bütçesini sessizce yiyordu
} = {}) {
  const model = options.model || 'gpt-4o-mini'
  const controller = new AbortController()
  const timeout = options.timeoutMs
    ? setTimeout(() => controller.abort(), options.timeoutMs)
    : null
  // 21 Eylül 2026 — 3 sağlayıcılı (Mistral/OpenAI/Claude) hız karşılaştırması
  // için: Mistral adaptörü zaten kendi süresini ölçüyordu, OpenAI çağrıları
  // ölçmüyordu — bu yüzden ai_usage_logs.duration_ms OpenAI satırlarında hep
  // NULL'du. Burada merkezi olarak ölçülüp logOpenAIUsage'a geçiriliyor,
  // böylece TÜM OpenAI çağrıları (sadece generate-quiz değil) için gerçek
  // süre kaydediliyor.
  const startedAt = Date.now()
  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: options.max_tokens || 1000,
        temperature: options.temperature ?? 0.3,
        response_format: options.json ? { type: 'json_object' } : undefined,
        messages,
      }),
      signal: controller.signal,
    })
  } finally {
    if (timeout) clearTimeout(timeout)
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  const data = await res.json()
  const durationMs = Date.now() - startedAt
  // Gerçek token tüketimini logla (best-effort, ana akışı bozmaz)
  await logOpenAIUsage(options.operation || 'openai', model, data, {
    userId: options.userId,
    quizSessionId: options.quizSessionId,
    requestId: options.requestId,
    durationMs,
  })
  const choice = data.choices[0]
  if (options.requireComplete && choice.finish_reason === 'length') {
    throw new OpenAITruncatedError()
  }
  return choice.message.content as string
}

// 1. Yedek model — Claude hata verirse GPT-4o devreye girer
export async function generateQuizFallback(prompt: string, count: number, context?: { userId?: string; quizSessionId?: string; requestId?: string }): Promise<string> {
  return callOpenAI([
    { role: 'system', content: 'You are an expert quiz generator. Return only valid JSON.' },
    { role: 'user', content: prompt }
  ], { model: 'gpt-4o-mini', max_tokens: 4000, json: true, operation: 'generate-quiz:fallback', ...context })
}

// 2. Görsel soru açıklama — GPT-4o Vision ile SVG/resim analizi
export async function explainVisualQuestion(imageBase64: string, question: string, lang: string): Promise<string> {
  return callOpenAI([
    { role: 'user', content: [
      { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
      { type: 'text', text: `Bu görseli ${lang} dilinde analiz et ve şu soruya cevap ver: ${question}. Kısa ve net açıkla (2-3 cümle).` }
    ]}
  ], { model: 'gpt-4o', max_tokens: 500, operation: 'explain-visual' })
}

// 3. Matematik doğrulama — GPT-4o ile çapraz kontrol
export async function verifyMathWithOpenAI(question: string, answer: string, lang: string): Promise<{correct: boolean, explanation: string}> {
  const result = await callOpenAI([
    { role: 'system', content: `You are a math verification assistant. Return JSON: {"correct": boolean, "explanation": "string"}` },
    { role: 'user', content: `Soru: ${question}\nVerilen cevap: ${answer}\nBu cevap doğru mu? Dil: ${lang}` }
  ], { model: 'gpt-4o-mini', max_tokens: 300, json: true, operation: 'verify-math' })
  try { return JSON.parse(result) } catch { return { correct: false, explanation: result } }
}

// 4. Genel soru doğrulama — bağımsız çapraz kontrol için (matematik odaklı,
// Claude'un kendi ürettiğini yine Claude'a kontrol ettirmek yerine farklı
// bir modelle gerçek bağımsız doğrulama sağlar)
export async function verifyQuestionWithOpenAI(prompt: string): Promise<{ ok: boolean; reason?: string; fix?: string }> {
  try {
    const result = await callOpenAI([
      { role: 'system', content: 'You are a strict educational content verifier. Respond only with valid JSON.' },
      { role: 'user', content: prompt },
    ], { model: 'gpt-4o', max_tokens: 250, json: true, operation: 'verify-questions:gpt4o' })
    return JSON.parse(result)
  } catch {
    return { ok: true } // Doğrulama başarısız olursa soruyu reddetme, geç
  }
}

export { callOpenAI }
