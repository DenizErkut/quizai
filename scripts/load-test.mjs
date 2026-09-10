/** Controlled demo load test. Defaults to local server; never targets production implicitly. */
const baseUrl = process.env.LOAD_TEST_BASE_URL ?? 'http://127.0.0.1:3000'
const users = Number(process.env.LOAD_TEST_USERS ?? 1000)
const rounds = Number(process.env.LOAD_TEST_ROUNDS ?? 2)
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
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
      })
      return { status: response.status, ms: performance.now() - t0 }
    } catch { return { status: 0, ms: performance.now() - t0 } }
  }))
  const elapsed = performance.now() - started
  const ok = results.filter(item => item.status >= 200 && item.status < 400).length
  const sorted = results.map(item => item.ms).sort((a, b) => a - b)
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  samples.push({ round: round + 1, requests: users, ok, errors: users - ok, elapsedMs: Math.round(elapsed), rps: Math.round(users / (elapsed / 1000)), p50Ms: Math.round(percentile(.5)), p95Ms: Math.round(percentile(.95)), p99Ms: Math.round(percentile(.99)) })
}
console.log(JSON.stringify({ baseUrl, protectedPreviewBypass: Boolean(bypassSecret), users, rounds, samples }, null, 2))
