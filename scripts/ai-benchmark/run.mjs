#!/usr/bin/env node
// PRATIUM model benchmark çalıştırıcısı (AI altyapı planı P1-1). Üretim rotalarına DOKUNMAZ; yalnız sentetik/anonim veri kümelerini okur.
//
// Kullanım:
//   node scripts/ai-benchmark/run.mjs --dataset scripts/ai-benchmark/datasets/math.synthetic.jsonl --mock           (ücretsiz kuru koşu)
//   AI_BENCH_BASE_URL=https://.../v1 AI_BENCH_API_KEY=... AI_BENCH_MODEL=... AI_BENCH_PRICE_IN=0.15 AI_BENCH_PRICE_OUT=0.6 \
//     AI_BENCH_MAX_USD=2 node scripts/ai-benchmark/run.mjs --dataset <jsonl> --repeats 1 --out reports/bench.json
// Anahtar yalnız ortam değişkeninden okunur; rapora/konsola yazılmaz. Bütçe tavanı aşılırsa koşu durur (ücretli çağrılar önceden onaylı olmalı).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { costUsd, mean, percentile, validateJsonShape, bootstrapCI } from '../../lib/ai-benchmark/metrics.ts'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, token, i, all) => {
  if (token.startsWith('--')) acc.push([token.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return acc
}, []))
if (!args.dataset) { console.error('--dataset gerekli'); process.exit(2) }
const cases = readFileSync(args.dataset, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const repeats = Math.max(1, Number(args.repeats || 1))
const mock = Boolean(args.mock)
const baseUrl = process.env.AI_BENCH_BASE_URL
const apiKey = process.env.AI_BENCH_API_KEY
const model = process.env.AI_BENCH_MODEL || (mock ? 'mock-model' : '')
const priceIn = Number(process.env.AI_BENCH_PRICE_IN || 0)
const priceOut = Number(process.env.AI_BENCH_PRICE_OUT || 0)
const maxUsd = Number(process.env.AI_BENCH_MAX_USD || (mock ? 0 : NaN))
if (!mock && (!baseUrl || !apiKey || !model || !Number.isFinite(maxUsd) || maxUsd <= 0)) {
  console.error('Gerçek koşu için AI_BENCH_BASE_URL, AI_BENCH_API_KEY, AI_BENCH_MODEL ve AI_BENCH_MAX_USD (> 0) gerekli. Ücretsiz deneme için --mock kullanın.'); process.exit(2)
}

function lastNumber(text) {
  const matches = String(text).replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/g)
  return matches ? Number(matches[matches.length - 1]) : null
}

function score(testCase, text) {
  if (testCase.scorer === 'number') { const n = lastNumber(text); return n !== null && Math.abs(n - testCase.expected) < 1e-6 ? 1 : 0 }
  if (testCase.scorer === 'label') return String(text).trim().toLowerCase().startsWith(String(testCase.expected).toLowerCase()) ? 1 : 0
  if (testCase.scorer === 'json') return validateJsonShape(text, testCase.schema) ? 1 : 0
  return 0
}

async function call(testCase) {
  if (mock) { // deterministik sahte yanıt: harness'in kendisini doğrulamak için
    const text = testCase.scorer === 'number' ? String(testCase.expected) : testCase.scorer === 'label' ? String(testCase.expected)
      : JSON.stringify(Object.fromEntries(Object.entries(testCase.schema).map(([k, t]) => [k, t === 'array' ? ['a'] : t === 'number' ? 0 : 'x'])))
    return { text, inputTokens: 100, outputTokens: 20, ms: 5 + Math.round(Math.random() * 5) }
  }
  const started = Date.now()
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 800, messages: [{ role: 'user', content: testCase.prompt }], ...(testCase.scorer === 'json' ? { response_format: { type: 'json_object' } } : {}) }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`HTTP_${response.status}`)
  const data = await response.json()
  return { text: data.choices?.[0]?.message?.content || '', inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0, ms: Date.now() - started }
}

const rows = []
let spent = 0
outer: for (let r = 0; r < repeats; r++) for (const testCase of cases) {
  if (!mock && spent >= maxUsd) { console.error(`Bütçe tavanı (${maxUsd} USD) doldu; koşu durduruldu.`); break outer }
  try {
    const result = await call(testCase)
    const cost = costUsd(result.inputTokens, result.outputTokens, priceIn, priceOut)
    spent += cost
    rows.push({ id: testCase.id, ok: true, score: score(testCase, result.text), ms: result.ms, cost })
  } catch (error) {
    rows.push({ id: testCase.id, ok: false, score: 0, ms: 0, cost: 0, error: String(error?.message || error).slice(0, 80) })
  }
}

const okRows = rows.filter(row => row.ok)
const ci = bootstrapCI(rows.map(row => row.score))
const report = {
  dataset: args.dataset, model, mock, generatedAt: new Date().toISOString(), requests: rows.length,
  qualityScore: ci.mean, qualityCI95: [ci.low, ci.high],
  avgLatencyMs: mean(okRows.map(row => row.ms)), p95LatencyMs: percentile(okRows.map(row => row.ms), 95),
  costPerRequestUsd: mean(rows.map(row => row.cost)), costPer1000RequestsUsd: mean(rows.map(row => row.cost)) * 1000,
  structuredOutputSuccessRate: cases.every(c => c.scorer === 'json') ? mean(rows.map(row => row.score)) : null,
  failureRate: rows.length ? 1 - okRows.length / rows.length : null,
  note: mock ? 'MOCK koşu: değerler yalnızca harness doğrulamasıdır, model ölçümü DEĞİLDİR.' : 'Gerçek ölçüm; örnek sayısı küçükse yönlendiricidir.',
}
console.log(JSON.stringify(report, null, 2))
if (args.out) { mkdirSync(dirname(args.out), { recursive: true }); writeFileSync(args.out, JSON.stringify(report, null, 2)) }
