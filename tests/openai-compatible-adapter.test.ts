import test from 'node:test'
import assert from 'node:assert/strict'
import { OpenAICompatibleAdapter, SensitiveDataBlockedError, compatConfigFromEnv, type CompatUsageEvent } from '../lib/ai-gateway/adapters/openai-compatible'

const config = { provider: 'groq' as const, baseUrl: 'https://example.test/openai/v1', apiKeyEnv: 'AI_GROQ_API_KEY', defaultModel: 'm-1' }
const ok = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const reply = { model: 'm-1', choices: [{ message: { content: '{"a":1}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } } }

test('yanıt normalleştirilir; önbellek token\'ı girişten ayrılır; kullanım bildirilir', async () => {
  const events: CompatUsageEvent[] = []
  let sent: { body?: string; headers?: Record<string, string> } = {}
  const adapter = new OpenAICompatibleAdapter(config, {
    env: { AI_GROQ_API_KEY: 'k' },
    fetch: (async (_url: string, init: { body?: string; headers?: Record<string, string> }) => { sent = init; return ok(reply)() }) as unknown as typeof fetch,
    onUsage: event => { events.push(event) },
  })
  const result = await adapter.execute({ messages: [{ role: 'user', content: 'Bana a@b.co yaz' }], json: true }, { task: 'quiz_generation' })
  assert.equal(result.content, '{"a":1}'); assert.equal(result.inputTokens, 60); assert.equal(result.cacheReadTokens, 40); assert.equal(result.outputTokens, 20)
  assert.equal(events[0].outcome, 'success')
  const body = JSON.parse(sent.body || '{}')
  assert.equal(body.messages[0].content, 'Bana [e-posta] yaz') // PII maskelendi
  assert.deepEqual(body.response_format, { type: 'json_object' })
  assert.equal(sent.headers?.Authorization, 'Bearer k')
})

test('hassas öğrenci verisi izinsiz sağlayıcıya gitmez; anahtar yoksa yapılandırılmamış sayılır', async () => {
  let called = false
  const adapter = new OpenAICompatibleAdapter(config, { env: {}, fetch: (async () => { called = true; return ok(reply)() }) as unknown as typeof fetch })
  assert.equal(adapter.isConfigured(), false)
  await assert.rejects(adapter.execute({ messages: [] }, { task: 'tutor_response', containsSensitiveStudentData: true }), SensitiveDataBlockedError)
  await assert.rejects(adapter.execute({ messages: [] }, { task: 'quiz_generation' }), /NOT_CONFIGURED/)
  assert.equal(called, false)
})

test('HTTP hatası status ile fırlatılır ve hata olayı bildirilir; http (https değil) reddedilir', async () => {
  const events: CompatUsageEvent[] = []
  const adapter = new OpenAICompatibleAdapter(config, { env: { AI_GROQ_API_KEY: 'k' }, fetch: ok({}, 503) as unknown as typeof fetch, onUsage: e => { events.push(e) } })
  await assert.rejects(adapter.execute({ messages: [] }, { task: 'quiz_generation' }), (error: { status?: number }) => error.status === 503)
  assert.equal(events[0].outcome, 'error'); assert.equal(events[0].status, 503)
  const insecure = new OpenAICompatibleAdapter({ ...config, baseUrl: 'http://example.test/v1' }, { env: { AI_GROQ_API_KEY: 'k', NODE_ENV: 'production' }, fetch: ok(reply) as unknown as typeof fetch })
  await assert.rejects(insecure.execute({ messages: [] }, { task: 'quiz_generation' }), /HTTPS/)
})

test('ortamdan yapılandırma: tanımsızsa null; hassas izin açıkça istenmeli', () => {
  assert.equal(compatConfigFromEnv('GROQ', {}), null)
  const c = compatConfigFromEnv('TOGETHER', { AI_TOGETHER_BASE_URL: 'https://x/v1', AI_TOGETHER_MODEL: 'm' })
  assert.equal(c?.allowSensitive, false)
  assert.equal(compatConfigFromEnv('TOGETHER', { AI_TOGETHER_BASE_URL: 'https://x/v1', AI_TOGETHER_MODEL: 'm', AI_TOGETHER_ALLOW_SENSITIVE: '1' })?.allowSensitive, true)
})
