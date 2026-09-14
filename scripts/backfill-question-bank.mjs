import { createHash, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const limitArg = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 200)
const limit = Math.max(1, Math.min(1000, limitArg))
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiKey = process.env.OPENAI_API_KEY
const geminiKey = process.env.GEMINI_API_KEY

let db
const personalFields = [
  'adaptivePolicyVersion', 'adaptiveReasonCode', 'adaptiveRecommendationId',
  'adaptiveHint', 'adaptiveSupportLevel', 'adaptivePresentation', 'adaptiveFocus',
  'diagnosticStrategyVersion', 'diagnosticReasonCode', 'diagnosticRole',
  'masteryConfidenceBefore', 'masteryEvidenceCountBefore', 'passage',
]
const validationSchema = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: { index: { type: 'integer' }, approved: { type: 'boolean' } },
        required: ['index', 'approved'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
}
const geminiValidationSchema = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { index: { type: 'INTEGER' }, approved: { type: 'BOOLEAN' } },
        required: ['index', 'approved'],
      },
    },
  },
  required: ['results'],
}

function key(value) {
  return String(value || '').trim().toLocaleLowerCase('tr-TR').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9çğıöşü]+/gi, ' ').trim()
}

function fingerprint(question) {
  return createHash('sha256').update([question.q, ...(question.opts || [])].map(key).join('|')).digest('hex')
}

function cleanQuestion(question) {
  const result = structuredClone(question)
  for (const field of personalFields) delete result[field]
  return result
}

function structurallyEligible(question) {
  return question && typeof question.q === 'string' && question.q.trim()
    && Array.isArray(question.opts) && question.opts.length >= 2
    && Number.isInteger(question.ans) && question.ans >= 0 && question.ans < question.opts.length
    && !question.sourceBased && !question.passage
}

async function openAIJudge(batch) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      max_tokens: 1200,
      response_format: { type: 'json_schema', json_schema: { name: 'validation_results', strict: true, schema: validationSchema } },
      messages: [
        { role: 'system', content: 'Sen MEB uyumlu eğitim sorularını denetleyen bağımsız bir uzmansın. Doğru cevap indeksini, açıklamayı, konu/sınıf uygunluğunu, dili ve seçenekleri kontrol et. Belirsiz soruyu reddet. Açıklama veya gerekçe yazma. Her indeks için tam bir sonuç ver. Yalnızca kısa JSON döndür: {"results":[{"index":0,"approved":true}]}' },
        { role: 'user', content: JSON.stringify(batch.map((item, index) => ({ index, topic: item.topic, grade: item.grade, language: item.language, question: item.question }))) },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error(`OpenAI validation failed: ${response.status}`)
  const data = await response.json()
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}')
  return { results: Array.isArray(parsed.results) ? parsed.results : [], usage: data.usage }
}

async function geminiJudge(batch) {
  const model = process.env.GEMINI_FINAL_VALIDATOR_MODEL || 'gemini-3.6-flash'
  const prompt = `MEB eğitim sorularını son kontrol uzmanı olarak denetle. Her soru için cevap indeksinin kesin doğruluğunu, açıklama tutarlılığını, konu ve sınıf uygunluğunu kontrol et. Belirsizse reddet. Açıklama veya gerekçe yazma. Her indeks için tam bir sonuç ver. Yalnızca kısa JSON döndür: {"results":[{"index":0,"approved":true}]}\n\n${JSON.stringify(batch.map((item, index) => ({ index, topic: item.topic, grade: item.grade, language: item.language, question: item.question })))}`
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 1200, responseMimeType: 'application/json', responseSchema: geminiValidationSchema } }),
    signal: AbortSignal.timeout(60000),
  })
  if (!response.ok) throw new Error(`Gemini validation failed: ${response.status}`)
  const data = await response.json()
  const text = (data.candidates?.[0]?.content?.parts || []).filter(part => !part.thought).map(part => part.text || '').join('') || '{}'
  const clean = text.replace(/```json|```/g, '').trim()
  const parsed = JSON.parse(clean.slice(clean.indexOf('{'), clean.lastIndexOf('}') + 1))
  return { results: Array.isArray(parsed.results) ? parsed.results : [], usage: data.usageMetadata }
}

async function logUsage(provider, model, usage, batchSize) {
  const inputTokens = Number(usage?.prompt_tokens ?? usage?.promptTokenCount ?? 0)
  const outputTokens = Number(usage?.completion_tokens ?? usage?.candidatesTokenCount ?? 0)
  const prices = provider === 'openai' ? { input: 0.4, output: 1.6 } : { input: 0.75, output: 3.75 }
  await db.from('ai_usage_logs').insert({
    provider, model, operation: 'question-bank:historical-validation',
    input_tokens: inputTokens, output_tokens: outputTokens,
    cost_usd: (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000,
    request_id: randomUUID(), meta: { batch_size: batchSize, backfill: true },
  })
}

export async function runQuestionBankBackfill(requestedLimit = limit) {
if (!supabaseUrl || !serviceKey || !openaiKey || !geminiKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY and GEMINI_API_KEY are required')
}
db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
const runLimit = Math.max(1, Math.min(1000, Number(requestedLimit) || 200))
const [{ data: sessions, error: sessionError }, { data: reports }, { data: existing }] = await Promise.all([
  db.from('quiz_sessions').select('id,topic,grade,language,question_type,questions,gen_engine,created_at').eq('completed', true).order('created_at', { ascending: false }).limit(1000),
  db.from('error_reports').select('question_text').limit(5000),
  db.from('question_bank').select('fingerprint').limit(10000),
])
if (sessionError) throw sessionError

const reported = new Set((reports || []).map(row => key(row.question_text)).filter(Boolean))
const known = new Set((existing || []).map(row => row.fingerprint))
const candidates = []
for (const session of sessions || []) {
  if (key(session.grade).includes('universite')) continue
  for (const raw of Array.isArray(session.questions) ? session.questions : []) {
    if (!structurallyEligible(raw) || reported.has(key(raw.q))) continue
    const question = cleanQuestion(raw)
    const hash = fingerprint(question)
    if (known.has(hash)) continue
    known.add(hash)
    candidates.push({
      fingerprint: hash, sessionId: session.id, engine: session.gen_engine,
      topic: session.topic, grade: session.grade, language: session.language,
      subject: question.subject || 'Genel', questionType: session.question_type || question.type || 'multiple_choice',
      difficulty: question.difficulty || 'normal', question,
    })
    if (candidates.length >= runLimit) break
  }
  if (candidates.length >= runLimit) break
}

let approved = 0, rejected = 0, deferred = 0
for (let offset = 0; offset < candidates.length; offset += 10) {
  const batch = candidates.slice(offset, offset + 10)
  try {
    const [gpt, gemini] = await Promise.all([openAIJudge(batch), geminiJudge(batch)])
    await Promise.all([
      logUsage('openai', process.env.OPENAI_VALIDATOR_MODEL || 'gpt-4.1-mini', gpt.usage, batch.length),
      logUsage('google', process.env.GEMINI_FINAL_VALIDATOR_MODEL || 'gemini-3.6-flash', gemini.usage, batch.length),
    ])
    const gptMap = new Map(gpt.results.map(item => [Number(item.index), item]))
    const geminiMap = new Map(gemini.results.map(item => [Number(item.index), item]))
    const rows = batch.map((item, index) => {
      const first = gptMap.get(index), second = geminiMap.get(index)
      const accepted = first?.approved === true && second?.approved === true
      if (accepted) approved++; else rejected++
      return {
        fingerprint: item.fingerprint,
        subject_key: key(item.subject), topic_key: key(item.topic), grade_key: key(item.grade), language_key: key(item.language),
        question_type: item.questionType, difficulty: item.difficulty, question: item.question,
        review_status: accepted ? 'approved' : 'rejected', quality_score: accepted ? 1 : 0,
        source_session_id: item.sessionId, source_engine: `${item.engine || 'historical'}|gpt+gemini`,
      }
    })
    const { error } = await db.from('question_bank').upsert(rows, { onConflict: 'fingerprint', ignoreDuplicates: true })
    if (error) throw error
    console.log(JSON.stringify({ processed: Math.min(offset + batch.length, candidates.length), total: candidates.length, approved, rejected, deferred }))
  } catch (error) {
    deferred += batch.length
    console.warn(JSON.stringify({ batch: offset / 10 + 1, deferred: batch.length, error: String(error?.message || error) }))
  }
}

return { done: true, candidates: candidates.length, approved, rejected, deferred }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (invokedDirectly) {
  runQuestionBankBackfill(limit)
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      console.error(error)
      process.exitCode = 1
    })
}
