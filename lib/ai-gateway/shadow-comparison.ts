import { MistralAdapter } from './adapters/mistral'

interface ShadowInput {
  systemPrompt: string
  userPrompt: string
  expectedCount: number
  userId: string
  sessionId: string
  requestId: string
}

export interface ShadowMetrics {
  provider: 'mistral'
  model: string
  expectedCount: number
  deliveredCount: number
  structurallyValidCount: number
  duplicateCount: number
  durationMs: number
  inputTokens: number
  outputTokens: number
  errorCode?: string
}

function parseQuestions(content: string): unknown[] {
  const clean = content.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean)
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : []
}

function normalizedQuestionText(question: any): string {
  return String(question?.q || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export async function runMistralShadowComparison(input: ShadowInput): Promise<ShadowMetrics> {
  const adapter = new MistralAdapter()
  if (!adapter.isConfigured()) {
    return { provider: 'mistral', model: process.env.MISTRAL_PRIMARY_MODEL || 'mistral-large-latest', expectedCount: input.expectedCount, deliveredCount: 0, structurallyValidCount: 0, duplicateCount: 0, durationMs: 0, inputTokens: 0, outputTokens: 0, errorCode: 'NOT_CONFIGURED' }
  }
  try {
    const response = await adapter.execute({
      messages: [{ role: 'system', content: input.systemPrompt }, { role: 'user', content: input.userPrompt }],
      maxTokens: input.expectedCount <= 7 ? 2500 : 3500,
      json: true,
    }, { task: 'quiz_generation', userId: input.userId, sessionId: input.sessionId, requestId: input.requestId })
    const questions = parseQuestions(response.content)
    const valid = questions.filter((question: any) => typeof question?.q === 'string' && question.q.trim() && Number.isInteger(question?.ans))
    const seen = new Set<string>()
    let duplicateCount = 0
    for (const question of valid) {
      const normalized = normalizedQuestionText(question)
      if (normalized && seen.has(normalized)) duplicateCount++
      if (normalized) seen.add(normalized)
    }
    return { provider: 'mistral', model: response.model, expectedCount: input.expectedCount, deliveredCount: questions.length, structurallyValidCount: valid.length, duplicateCount, durationMs: response.durationMs, inputTokens: response.inputTokens, outputTokens: response.outputTokens }
  } catch (error: any) {
    const safeCode = String(error?.message || 'UNKNOWN_ERROR').replace(/[^A-Z0-9_]/gi, '_').slice(0, 80)
    return { provider: 'mistral', model: process.env.MISTRAL_PRIMARY_MODEL || 'mistral-large-latest', expectedCount: input.expectedCount, deliveredCount: 0, structurallyValidCount: 0, duplicateCount: 0, durationMs: 0, inputTokens: 0, outputTokens: 0, errorCode: safeCode }
  }
}
