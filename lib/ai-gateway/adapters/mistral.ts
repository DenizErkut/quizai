import { logAIUsage } from '@/lib/ai-usage'
import type { AIProviderAdapter, IntelligenceRequestContext } from '../contracts'

export interface MistralChatRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model?: string
  maxTokens?: number
  temperature?: number
  json?: boolean
}

export interface MistralChatResponse {
  content: string
  model: string
  inputTokens: number
  outputTokens: number
  durationMs: number
}

export class MistralAdapter implements AIProviderAdapter<MistralChatRequest, MistralChatResponse> {
  readonly provider = 'mistral' as const

  isConfigured(): boolean {
    return Boolean(process.env.MISTRAL_API_KEY)
  }

  async execute(request: MistralChatRequest, context: IntelligenceRequestContext): Promise<MistralChatResponse> {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) throw new Error('MISTRAL_NOT_CONFIGURED')
    const model = request.model || process.env.MISTRAL_PRIMARY_MODEL || 'mistral-large-latest'
    const startedAt = Date.now()
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: request.messages,
        max_tokens: request.maxTokens || 3500,
        temperature: request.temperature ?? 0.3,
        response_format: request.json ? { type: 'json_object' } : undefined,
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!response.ok) throw new Error(`MISTRAL_HTTP_${response.status}`)
    const data = await response.json()
    const durationMs = Date.now() - startedAt
    const inputTokens = Number(data?.usage?.prompt_tokens || 0)
    const outputTokens = Number(data?.usage?.completion_tokens || 0)
    await logAIUsage({
      operation: 'generate-quiz:shadow-mistral',
      provider: 'mistral',
      model,
      inputTokens,
      outputTokens,
      durationMs,
      userId: context.userId,
      quizSessionId: context.sessionId,
      requestId: context.requestId,
      meta: { policyVersion: 'multi-ai-gateway-v3-p0', shadow: true },
    })
    return { content: data?.choices?.[0]?.message?.content || '', model, inputTokens, outputTokens, durationMs }
  }
}
