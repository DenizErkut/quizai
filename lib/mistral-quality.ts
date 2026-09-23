import { Resvg } from '@resvg/resvg-js'
import { MistralAdapter } from '@/lib/ai-gateway'

export type MistralQuestionReview = { ok: boolean; reason?: string } | null
export type MistralVisualReview = {
  passed: boolean
  score: number
  reason: string
  contextMatch: boolean
  answerLeak: boolean
  useful: boolean
} | null

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json|```/gi, '').trim()
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

export function svgToPngDataUrl(svg: string): string {
  const renderer = new Resvg(svg, {
    background: 'white',
    fitTo: { mode: 'width', value: 800 },
  })
  const png = renderer.render().asPng()
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`
}

export async function verifyQuestionWithMistral(
  verifyPrompt: string,
  context: { userId?: string; sessionId?: string; requestId?: string } = {},
): Promise<MistralQuestionReview> {
  const adapter = new MistralAdapter()
  if (!adapter.isConfigured()) return null
  try {
    const response = await adapter.execute({
      model: process.env.MISTRAL_QUALITY_MODEL || 'mistral-small-latest',
      messages: [
        { role: 'system', content: 'You are an independent K-12 question quality auditor. Be strict. Return only valid JSON.' },
        { role: 'user', content: verifyPrompt },
      ],
      maxTokens: 220,
      temperature: 0,
      json: true,
      timeoutMs: 20000,
    }, {
      task: 'content_validation',
      operationTag: 'verify-questions:mistral',
      shadow: false,
      ...context,
    })
    const parsed = parseJsonObject(response.content)
    if (!parsed || typeof parsed.ok !== 'boolean') return null
    return {
      ok: parsed.ok,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 240) : undefined,
    }
  } catch (error) {
    console.warn('[mistral-quality] question validator unavailable:', error instanceof Error ? error.message : 'unknown')
    return null
  }
}

export async function verifyVisualWithMistral(args: {
  questionText: string
  correctAnswer: string
  svg: string
}): Promise<MistralVisualReview> {
  const adapter = new MistralAdapter()
  if (!adapter.isConfigured()) return null
  try {
    const imageDataUrl = svgToPngDataUrl(args.svg)
    const prompt = `Bu eğitim görselini, aşağıdaki sorunun gerçek ekran görüntüsü olarak denetle.

SORU: ${args.questionText}
DOĞRU CEVAP (görselde açıkça görünmemeli): ${args.correctAnswer || 'belirtilmedi'}

Şunları ayrı ayrı kontrol et:
1. Görseldeki tüm nesne, sayı, birim, eksen, etiket ve ilişkiler soruyla birebir uyumlu mu?
2. Grafik/ölçek değerleri matematiksel olarak tutarlı mı?
3. Görsel doğru cevabı veya çözüm sonucunu açığa çıkarıyor mu?
4. Görsel çözüm için yararlı veri taşıyor mu; yoksa yalnızca soru metnini süsleyip tekrar mı ediyor?
5. Yazılar okunuyor ve çizim hatasız görünüyor mu?

Yalnızca JSON döndür: {"score":0-100,"contextMatch":true,"answerLeak":false,"useful":true,"renderingIssue":false,"reason":"kısa Türkçe gerekçe"}`
    const response = await adapter.execute({
      model: process.env.MISTRAL_VISION_VALIDATOR_MODEL || 'mistral-small-latest',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: imageDataUrl },
        ],
      }],
      maxTokens: 260,
      temperature: 0,
      json: true,
      timeoutMs: 20000,
    }, {
      task: 'multimodal_analysis',
      requiresVision: true,
      operationTag: 'visual-question:validate-mistral',
      shadow: false,
    })
    const parsed = parseJsonObject(response.content)
    if (!parsed) return null
    const score = Number(parsed.score)
    const contextMatch = parsed.contextMatch === true
    const answerLeak = parsed.answerLeak === true
    const useful = parsed.useful === true
    const renderingIssue = parsed.renderingIssue === true
    const reason = typeof parsed.reason === 'string' ? parsed.reason.slice(0, 240) : 'Mistral görsel denetimi gerekçe döndürmedi.'
    const passed = Number.isFinite(score) && score >= 88 && contextMatch && !answerLeak && useful && !renderingIssue
    return { passed, score: Number.isFinite(score) ? score : 0, reason, contextMatch, answerLeak, useful }
  } catch (error) {
    console.warn('[mistral-quality] visual validator unavailable:', error instanceof Error ? error.message : 'unknown')
    return null
  }
}
