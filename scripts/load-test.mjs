/** Controlled demo load test. Defaults to local server; never targets production implicitly. */
const baseUrl = process.env.LOAD_TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const users = Number(process.env.LOAD_TEST_USERS ?? 1000)
const rounds = Number(process.env.LOAD_TEST_ROUNDS ?? 2)
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
const timeoutMs = Number(process.env.LOAD_TEST_TIMEOUT_MS ?? 30000)
const paths = ['/', '/pricing', '/login']
const samples = []
for (let round = 0; round < rounds; round++) {
  const started = performance.now()
  const results = await Promise.all(Array.from({ length: users }, async (_, index) => {
    const path = paths[index % paths.length]
    const t0 = performance.now()
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        redirect: 'manual',
        headers: bypassSecret ? { 'x-vercel-protection-bypass': bypassSecret } : {},
        signal: AbortSignal.timeout(timeoutMs),
      })
      return { status: response.status, ms: performance.now() - t0, error: null }
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : 'UnknownError'
      return { status: 0, ms: performance.now() - t0, error: message }
    }
  }))
  const elapsed = performance.now() - started
  const ok = results.filter(item => item.status >= 200 && item.status < 400).length
  const sorted = results.map(item => item.ms).sort((a, b) => a - b)
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  const statusCounts = Object.fromEntries(Object.entries(results.reduce((acc, item) => { const key = String(item.status); acc[key] = (acc[key] ?? 0) + 1; return acc }, {})).sort())
  const errorCounts = Object.fromEntries(Object.entries(results.reduce((acc, item) => { if (item.error) acc[item.error] = (acc[item.error] ?? 0) + 1; return acc }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5))
  samples.push({ round: round + 1, requests: users, ok, errors: users - ok, errorRatePct: Number((((users - ok) / users) * 100).toFixed(2)), elapsedMs: Math.round(elapsed), rps: Math.round(users / (elapsed / 1000)), p50Ms: Math.round(percentile(.5)), p95Ms: Math.round(percentile(.95)), p99Ms: Math.round(percentile(.99)), statusCounts, errorCounts })
}
console.log(JSON.stringify({ baseUrl, protectedPreviewBypass: Boolean(bypassSecret), users, rounds, timeoutMs, samples }, null, 2))
