// OpenAI-uyumlu Chat Completions adapter'ı (AI altyapı planı P1-5). Tek sınıf; Hugging Face Inference Providers, Together, Groq,
// vLLM ve Ollama gibi aynı sözleşmeyi sunan sağlayıcıları yapılandırmayla kapsar.
// DURUM: karanlık. Hiçbir üretim rotası bu adapter'ı çağırmaz; yönlendirme tablosuna bağlanması ayrı onay (G5) gerektirir.
// Güvenlik: anahtar yalnız sunucu ortam değişkeninden okunur; S3 veri reddedilir; S2 veri yalnız `allowSensitive` sağlayıcıya gider;
// gönderilen metne PII maskeleme uygulanır; baseUrl https olmak zorundadır (yerel geliştirme hariç).
import type { AIProvider, AIProviderAdapter, IntelligenceRequestContext } from '../contracts'
import { maskPii } from '../pii-guard'

export interface OpenAICompatibleConfig {
  provider: Extract<AIProvider, 'huggingface' | 'together' | 'groq' | 'selfhosted'>
  baseUrl: string                 // örn. https://api.groq.com/openai/v1 (sağlayıcı belgesinden teyit edilmeli)
  apiKeyEnv: string               // anahtarın ortam değişkeni adı (değeri değil)
  defaultModel: string
  allowSensitive?: boolean        // S2 (öğrenci serbest metni) bu sağlayıcıya gidebilir mi? DPA doğrulanmadıkça false
  extraHeaders?: Record<string, string>
  requireApiKey?: boolean         // self-host'ta (yerel vLLM/Ollama) false olabilir
}

export interface CompatChatRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model?: string
  maxTokens?: number
  temperature?: number
  json?: boolean
  timeoutMs?: number
}

export interface CompatChatResponse {
  content: string
  model: string
  provider: OpenAICompatibleConfig['provider']
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  durationMs: number
  finishReason: string
}

export interface CompatUsageEvent {
  provider: OpenAICompatibleConfig['provider']; model: string; inputTokens: number; outputTokens: number
  cacheReadTokens: number; durationMs: number; outcome: 'success' | 'error'; errorType?: string; status?: number
  context: IntelligenceRequestContext
}

export interface CompatDeps {
  fetch?: typeof fetch
  env?: Record<string, string | undefined>
  onUsage?: (event: CompatUsageEvent) => void | Promise<void>   // üretimde logAIUsage'a bağlanır
}

export class SensitiveDataBlockedError extends Error {
  constructor(message: string) { super(message); this.name = 'SensitiveDataBlockedError' }
}

export class OpenAICompatibleAdapter implements AIProviderAdapter<CompatChatRequest, CompatChatResponse> {
  readonly provider: OpenAICompatibleConfig['provider']
  constructor(private readonly config: OpenAICompatibleConfig, private readonly deps: CompatDeps = {}) {
    this.provider = config.provider
  }

  private env(): Record<string, string | undefined> { return this.deps.env ?? process.env }

  isConfigured(): boolean {
    if (this.config.requireApiKey === false) return Boolean(this.config.baseUrl)
    return Boolean(this.env()[this.config.apiKeyEnv])
  }

  private endpoint(): string {
    const url = new URL(this.config.baseUrl.replace(/\/+$/, '') + '/chat/completions')
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    if (url.protocol !== 'https:' && !(local && this.env().NODE_ENV !== 'production')) throw new Error('COMPAT_BASE_URL_MUST_BE_HTTPS')
    return url.toString()
  }

  async execute(request: CompatChatRequest, context: IntelligenceRequestContext): Promise<CompatChatResponse> {
    if (context.containsSensitiveStudentData && !this.config.allowSensitive) {
      throw new SensitiveDataBlockedError(`SENSITIVE_DATA_BLOCKED:${this.config.provider}`)
    }
    const apiKey = this.env()[this.config.apiKeyEnv]
    if (this.config.requireApiKey !== false && !apiKey) throw new Error(`${this.config.provider.toUpperCase()}_NOT_CONFIGURED`)
    const model = request.model || this.config.defaultModel
    const doFetch = this.deps.fetch ?? fetch
    const startedAt = Date.now()
    const report = (event: Omit<CompatUsageEvent, 'provider' | 'model' | 'durationMs' | 'context'>) => {
      try { void this.deps.onUsage?.({ provider: this.provider, model, durationMs: Date.now() - startedAt, context, ...event }) } catch { /* ölçüm asla çağrıyı bozmaz */ }
    }
    let response: Response
    try {
      response = await doFetch(this.endpoint(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}), ...(this.config.extraHeaders || {}) },
        body: JSON.stringify({
          model,
          messages: request.messages.map(message => ({ role: message.role, content: maskPii(message.content) })),
          max_tokens: request.maxTokens || 1500,
          temperature: request.temperature ?? 0.3,
          ...(request.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(request.timeoutMs || 45_000),
      })
    } catch (error) {
      const e = error as { name?: string } | null
      report({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, outcome: 'error', errorType: e?.name || 'FetchError' })
      throw error
    }
    if (!response.ok) {
      report({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, outcome: 'error', errorType: 'HttpError', status: response.status })
      const error = new Error(`${this.config.provider.toUpperCase()}_HTTP_${response.status}`) as Error & { status?: number }
      error.status = response.status
      throw error
    }
    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } }
      model?: string
    }
    const cached = data.usage?.prompt_tokens_details?.cached_tokens || 0
    const result: CompatChatResponse = {
      content: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      provider: this.provider,
      inputTokens: Math.max(0, (data.usage?.prompt_tokens || 0) - cached),
      outputTokens: data.usage?.completion_tokens || 0,
      cacheReadTokens: cached,
      durationMs: Date.now() - startedAt,
      finishReason: data.choices?.[0]?.finish_reason || 'unknown',
    }
    report({ inputTokens: result.inputTokens, outputTokens: result.outputTokens, cacheReadTokens: cached, outcome: 'success' })
    return result
  }
}

/** Ortam değişkenlerinden (AI_<AD>_BASE_URL/MODEL/KEY) adapter üretir; tanımsızsa null. Anahtar değeri hiçbir yere yazılmaz. */
export function compatConfigFromEnv(name: 'HUGGINGFACE' | 'TOGETHER' | 'GROQ' | 'SELFHOSTED', env: Record<string, string | undefined> = process.env): OpenAICompatibleConfig | null {
  const baseUrl = env[`AI_${name}_BASE_URL`]
  const defaultModel = env[`AI_${name}_MODEL`]
  if (!baseUrl || !defaultModel) return null
  return {
    provider: name.toLowerCase() as OpenAICompatibleConfig['provider'],
    baseUrl, defaultModel,
    apiKeyEnv: `AI_${name}_API_KEY`,
    allowSensitive: env[`AI_${name}_ALLOW_SENSITIVE`] === '1',
    requireApiKey: name === 'SELFHOSTED' ? env[`AI_${name}_API_KEY`] !== undefined : true,
  }
}
