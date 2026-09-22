// lib/ai-gateway/quiz-provider-router.ts
//
// 22 Eylül 2026 — Deniz'in fark ettiği gibi: generate-quiz/route.ts'te
// uygulanan çoklu-sağlayıcı tasarımı (GPT-4.1-mini gövde motor, Mistral
// mevcut canlı payı, Claude YALNIZCA zor/çok zor zorluk için) platformdaki
// diğer "test alanları"na (canlı quiz, deneme sınavı, açık uçlu soru
// üretimi) hiç uygulanmamıştı — bunlar hâlâ SADECE Claude kullanıyordu.
//
// Bu modül generate-quiz/route.ts'in kendi (çalışan, doğrulanmış, canlı
// trafikte test edilmiş) inline mantığını AYNEN tekrarlıyor — generate-quiz
// dosyasına DOKUNULMADI (regresyon riskini önlemek için). Bu modül SADECE
// yeni entegre edilen uç noktalar (live-quiz, generate-exam,
// generate-open-ended, teacher/create-open-ended) tarafından kullanılıyor.
//
// Karar sırası (generate-quiz ile birebir aynı): admin forceProvider testi
// (kovadan bağımsız) > zorluk tabanlı Claude zorunluluğu (varsa) > Mistral
// kovası (payı MISTRAL_LIVE_FRACTION ile aynı, varsayılan %0) > GPT-4.1-mini
// (varsayılan gövde, GPT_PILOT_FRACTION ile ayarlanabilir, varsayılan %100).
//
// ÖNEMLİ FARK: generate-exam ve açık uçlu soru üretiminde generate-quiz'deki
// gibi ÖNCEDEN bilinen bir "zor/çok zor" seçimi YOK (generate-exam tek bir
// çağrıda %30 kolay/%50 orta/%20 zor karışık bir soru seti üretiyor; açık
// uçlu uçlarda zorluk sınıf seviyesinden çıkarılıyor, öğrenci/öğretmen
// tarafından seçilmiyor). Bu yüzden bu iki alanda hardDifficulty hiç
// kullanılmıyor — sadece GPT-4.1-mini gövde + Mistral payı uygulanıyor.
// Yalnızca canlı quiz'de (öğretmen 'zor' seçebiliyor) hardDifficulty devrede.

import Anthropic from '@anthropic-ai/sdk'
import { callOpenAI } from '@/lib/openai'
import { MistralAdapter, isProviderConfigured } from '@/lib/ai-gateway'
import { logAnthropicUsage } from '@/lib/ai-usage'

const anthropic = new Anthropic()

export type QuizEngine = 'mistral' | 'gpt-4.1-mini' | 'claude-sonnet' | 'claude-haiku'
export type ForceProvider = 'mistral' | 'openai' | 'claude' | null
export type ExperimentVariant = 'gpt-4.1-mini' | 'mistral-live' | 'claude-hard-difficulty' | 'control' | null

export interface QuizRoutingDecision {
  engine: QuizEngine
  experimentVariant: ExperimentVariant
  genEngineTag: string
}

function hashBucket(key: string): number {
  let hash = 2166136261
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0) % 10000
}

export function pickQuizEngine(opts: {
  // Deterministik kova için anahtar — genelde `${feature}:${userId}` (aynı
  // kullanıcı aynı deney boyunca aynı grupta kalsın diye, generate-quiz'deki
  // `quiz-generation-v1:${user.id}` deseniyle aynı fikir, farklı feature adı).
  bucketKey: string
  // true ise Claude zorunlu (admin test hariç) — sadece bu bilgi
  // ÜRETİMDEN ÖNCE biliniyorsa geçirilsin (bkz. yukarıdaki not).
  hardDifficulty?: boolean
  // Yalnızca admin test — kovadan bağımsız istenen sağlayıcıyı zorlar.
  forceProvider?: ForceProvider
  // false ise (ör. üniversite seviyesi, devam eden oturum gibi pilot dışı
  // durumlar) her zaman Claude'a düşer — generate-quiz'deki pilotEligible'ın
  // aynısı.
  pilotEligible?: boolean
  // Claude seçilirse hangi model kullanılsın.
  useHaiku?: boolean
}): QuizRoutingDecision {
  const { bucketKey, hardDifficulty = false, forceProvider = null, pilotEligible = true, useHaiku = false } = opts

  if (!pilotEligible) {
    const engine: QuizEngine = useHaiku ? 'claude-haiku' : 'claude-sonnet'
    return { engine, experimentVariant: null, genEngineTag: engine }
  }

  const configuredGptFraction = Number(process.env.GPT_PILOT_FRACTION ?? '1.0')
  const GPT_PILOT_FRACTION = Number.isFinite(configuredGptFraction) ? Math.min(1, Math.max(0, configuredGptFraction)) : 1.0
  const configuredMistralFraction = Number(process.env.MISTRAL_LIVE_FRACTION ?? '0')
  const MISTRAL_LIVE_FRACTION = Number.isFinite(configuredMistralFraction) ? Math.min(1, Math.max(0, configuredMistralFraction)) : 0

  const bucket = hashBucket(bucketKey)
  const mistralBucketEnd = Math.round(MISTRAL_LIVE_FRACTION * 10000)
  const gptBucketEnd = mistralBucketEnd + Math.round(GPT_PILOT_FRACTION * 10000)

  const isForcedTest = forceProvider !== null
  const claudeRequired = !isForcedTest && hardDifficulty

  const useMistral = isProviderConfigured('mistral') && forceProvider !== 'openai' && forceProvider !== 'claude' && !claudeRequired && (forceProvider === 'mistral' || bucket < mistralBucketEnd)
  const useGpt = !useMistral && forceProvider !== 'claude' && !claudeRequired && (forceProvider === 'openai' || bucket < gptBucketEnd)

  if (useMistral) {
    return {
      engine: 'mistral',
      experimentVariant: isForcedTest ? null : 'mistral-live',
      genEngineTag: forceProvider === 'mistral' ? 'mistral-admin-test' : 'mistral-large',
    }
  }
  if (useGpt) {
    return {
      engine: 'gpt-4.1-mini',
      experimentVariant: isForcedTest ? null : 'gpt-4.1-mini',
      genEngineTag: forceProvider === 'openai' ? 'gpt-4.1-mini-admin-test' : 'gpt-4.1-mini',
    }
  }

  const claudeEngine: QuizEngine = useHaiku ? 'claude-haiku' : 'claude-sonnet'
  const tagSuffix = forceProvider === 'claude' ? '-admin-test' : (claudeRequired ? '-hard-difficulty' : '')
  return {
    engine: claudeEngine,
    experimentVariant: isForcedTest ? null : (claudeRequired ? 'claude-hard-difficulty' : 'control'),
    genEngineTag: `${claudeEngine}${tagSuffix}`,
  }
}

export interface RoutedGenerationParams {
  // Claude çağrısında birebir Anthropic `system` alanına, diğer
  // sağlayıcılarda system mesajına düz metin olarak birleştirilerek geçirilir.
  systemPrompt: string | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }[]
  userPrompt: string
  maxTokens: number
  operationTag: string
  userId: string
  quizSessionId?: string
  requestId?: string
  // Claude budget-aware timeout için: bu deadline'a (fonksiyon başlangıcından
  // itibaren ms) göre timeout hesaplanır. Vermezsen tam bütçe (100sn) varsayılır.
  claudeCallDeadlineMs?: number
  requestStartTime?: number
}

function flattenSystemPrompt(systemPrompt: RoutedGenerationParams['systemPrompt']): string {
  return typeof systemPrompt === 'string' ? systemPrompt : systemPrompt.map(block => block.text).join('\n\n')
}

// Seçilen motoru çağırır, ham metni döndürür — JSON parse/şema doğrulama
// HER uç noktaya özgü olduğu için çağırana bırakılıyor. Mistral/GPT-4.1-mini
// başarısız olursa (ağ/HTTP hatası) exception fırlatır; çağıran taraf
// isterse Claude'a (pickQuizEngine'i forceProvider:'claude' ile tekrar
// çağırıp) fallback yapabilir — generate-quiz'deki "seçilen motor başarısız
// olursa öğrenciye asla 500 dönme" prensibiyle aynı.
export async function generateWithRoutedProvider(
  decision: QuizRoutingDecision,
  params: RoutedGenerationParams
): Promise<{ text: string; durationMs: number }> {
  const startedAt = Date.now()
  const flatSystem = flattenSystemPrompt(params.systemPrompt)

  if (decision.engine === 'mistral') {
    const mistralAdapter = new MistralAdapter()
    const response = await mistralAdapter.execute(
      {
        messages: [
          { role: 'system', content: flatSystem },
          { role: 'user', content: params.userPrompt },
        ],
        maxTokens: params.maxTokens,
        json: true,
      },
      {
        task: 'quiz_generation',
        userId: params.userId,
        sessionId: params.quizSessionId,
        requestId: params.requestId,
        operationTag: params.operationTag,
        shadow: false,
      }
    )
    return { text: response.content, durationMs: Date.now() - startedAt }
  }

  if (decision.engine === 'gpt-4.1-mini') {
    const text = await callOpenAI(
      [
        { role: 'system', content: flatSystem },
        { role: 'user', content: params.userPrompt },
      ],
      {
        model: 'gpt-4.1-mini',
        max_tokens: params.maxTokens,
        json: true,
        operation: params.operationTag,
        userId: params.userId,
        quizSessionId: params.quizSessionId,
        requestId: params.requestId,
      }
    )
    return { text, durationMs: Date.now() - startedAt }
  }

  // Claude (sonnet ya da haiku) — 21 Eylül'deki timeout/maxRetries düzeltmesi
  // burada da uygulanıyor: budget-aware timeout + maxRetries:0, aksi halde
  // SDK'nın 10dk'lık varsayılan zaman aşımı Vercel'in kendi fonksiyon
  // zaman aşımından önce yakalanamayıp sessiz 500'e yol açabilir.
  const requestStartTime = params.requestStartTime ?? startedAt
  const deadline = params.claudeCallDeadlineMs ?? 100000
  const timeoutMs = Math.max(20000, deadline - (Date.now() - requestStartTime))
  const model = decision.engine === 'claude-haiku' ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-5'
  const response = await anthropic.messages.create({
    model,
    max_tokens: params.maxTokens,
    system: params.systemPrompt as any,
    messages: [{ role: 'user', content: params.userPrompt }],
  }, { timeout: timeoutMs, maxRetries: 0 })
  const durationMs = Date.now() - startedAt
  await logAnthropicUsage(params.operationTag, model, response, {
    userId: params.userId,
    quizSessionId: params.quizSessionId,
    requestId: params.requestId,
    durationMs,
  })
  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  return { text, durationMs }
}
