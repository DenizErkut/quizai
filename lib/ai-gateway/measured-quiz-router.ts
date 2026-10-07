import { createClient } from '@/lib/supabase/server-create-client'
import { isProviderConfigured } from './model-registry'
import { pickQuizEngine, type ForceProvider, type QuizRoutingDecision } from './quiz-provider-router'
import { readAll } from '@/lib/paginate'

type ProviderKey = 'openai' | 'mistral' | 'anthropic'
type Metric = { provider: ProviderKey; calls: number; outcomeSample: number; operationalSuccessRate: number | null; costPerCall: number | null; p95Ms: number | null }

export type MeasuredQuizDecision = QuizRoutingDecision & {
  policyVersion: 'measured-router-v1'
  routingMode: 'shadow' | 'active'
  routingReason: string
  measuredProvider?: ProviderKey
  recommendedEngine: QuizRoutingDecision['engine']
}

const CACHE_MS = 5 * 60_000
let cache: { expiresAt: number; metrics: Metric[] } | null = null

function providerForEngine(engine: QuizRoutingDecision['engine']): ProviderKey {
  if (engine === 'mistral') return 'mistral'
  if (engine === 'gpt-4.1-mini') return 'openai'
  return 'anthropic'
}

async function loadMetrics(): Promise<Metric[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.metrics
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await readAll(() => db.from('ai_usage_logs')
    .select('provider,operation,cost_usd,duration_ms,meta').gte('created_at', since))
  if (error) throw new Error(error.message)

  const groups = new Map<ProviderKey, { calls: number; costs: number; priced: number; durations: number[]; success: number; failed: number }>()
  for (const row of data || []) {
    const operation = String(row.operation || '')
    if (!/^(generate-|live-quiz|teacher:create-open-ended)/.test(operation)) continue
    if (!['openai', 'mistral', 'anthropic'].includes(String(row.provider))) continue
    const provider = row.provider as ProviderKey
    const group = groups.get(provider) || { calls: 0, costs: 0, priced: 0, durations: [], success: 0, failed: 0 }
    group.calls++
    const cost = Number(row.cost_usd)
    if (Number.isFinite(cost) && cost >= 0) { group.costs += cost; group.priced++ }
    const duration = Number(row.duration_ms)
    if (Number.isFinite(duration) && duration >= 0) group.durations.push(duration)
    const meta = (row.meta || {}) as Record<string, unknown>
    const outcome = String(meta.outcome || '').toLowerCase()
    const hasStatus = meta.status !== undefined && meta.status !== null
    const status = hasStatus ? Number(meta.status) : Number.NaN
    const evidenced = Boolean(outcome) || (hasStatus && Number.isFinite(status))
    const failed = outcome.includes('error') || outcome.includes('fail') || (Number.isFinite(status) && status >= 400)
    if (evidenced) {
      if (failed) group.failed++
      else group.success++
    }
    groups.set(provider, group)
  }

  const metrics = [...groups.entries()].map(([provider, group]) => {
    group.durations.sort((a, b) => a - b)
    const outcomeSample = group.success + group.failed
    return {
      provider,
      calls: group.calls,
      outcomeSample,
      operationalSuccessRate: outcomeSample ? group.success / outcomeSample : null,
      costPerCall: group.priced ? group.costs / group.priced : null,
      p95Ms: group.durations.length ? group.durations[Math.min(group.durations.length - 1, Math.floor(group.durations.length * 0.95))] : null,
    }
  })
  cache = { expiresAt: Date.now() + CACHE_MS, metrics }
  return metrics
}

function fallbackProvider(provider: ProviderKey): ForceProvider {
  if (provider === 'mistral' && isProviderConfigured('openai')) return 'openai'
  if (provider === 'openai' && isProviderConfigured('anthropic')) return 'claude'
  return null
}

export async function pickMeasuredQuizEngine(opts: {
  bucketKey: string
  hardDifficulty?: boolean
  forceProvider?: ForceProvider
  pilotEligible?: boolean
  useHaiku?: boolean
}): Promise<MeasuredQuizDecision> {
  const base = pickQuizEngine(opts)
  const mode = process.env.MEASURED_ROUTER_MODE === 'active' ? 'active' : 'shadow'
  const protectedDecision = Boolean(opts.forceProvider) || opts.hardDifficulty === true || opts.pilotEligible === false
  if (protectedDecision) return { ...base, policyVersion: 'measured-router-v1', routingMode: 'shadow', routingReason: 'ROLE_OR_MANUAL_POLICY_PROTECTED', recommendedEngine: base.engine }

  function decision(recommendedEngine: QuizRoutingDecision['engine'], routingReason: string, measuredProvider?: ProviderKey): MeasuredQuizDecision {
    // Measurements are collected without changing the live provider by default.
    // Active mode must be explicitly enabled after evaluation and sufficient samples.
    const engine = mode === 'active' ? recommendedEngine : base.engine
    const genEngineTag = engine === recommendedEngine ? base.genEngineTag : `${base.genEngineTag}-measured-shadow`
    return { ...base, engine, genEngineTag, policyVersion: 'measured-router-v1', routingMode: mode,
      routingReason, measuredProvider, recommendedEngine }
  }

  try {
    const metrics = await loadMetrics()
    const provider = providerForEngine(base.engine)
    const current = metrics.find(metric => metric.provider === provider)
    if (!current || current.calls < 20 || current.outcomeSample < 10) {
      return decision(base.engine, 'INSUFFICIENT_MEASURED_SAMPLE', provider)
    }

    const comparable = metrics.filter(metric => metric.provider !== provider && metric.calls >= 20 && metric.outcomeSample >= 10 && metric.operationalSuccessRate !== null && metric.operationalSuccessRate >= 0.7)
    const cheapestComparable = comparable.filter(metric => metric.costPerCall !== null).sort((a, b) => (a.costPerCall || 0) - (b.costPerCall || 0))[0]
    const callSuccessBlocked = current.operationalSuccessRate !== null && current.operationalSuccessRate < 0.7
    const latencyBlocked = current.p95Ms !== null && current.p95Ms > 90_000
    const costBlocked = Boolean(current.costPerCall !== null && cheapestComparable?.costPerCall !== null
      && current.costPerCall > cheapestComparable.costPerCall * 2.5
      && (current.operationalSuccessRate || 0) <= (cheapestComparable.operationalSuccessRate || 0) + 0.02)
    if (!callSuccessBlocked && !latencyBlocked && !costBlocked) {
      return decision(base.engine, 'MEASURED_PROVIDER_HEALTHY', provider)
    }

    const forcedFallback = fallbackProvider(provider)
    if (!forcedFallback) return decision(base.engine, 'NO_CONFIGURED_SAFE_FALLBACK', provider)
    const fallback = pickQuizEngine({ ...opts, forceProvider: forcedFallback })
    const reasons = [callSuccessBlocked && 'CALL_SUCCESS_BELOW_70', latencyBlocked && 'P95_ABOVE_90S', costBlocked && 'COST_OUTLIER'].filter(Boolean).join('+')
    return decision(fallback.engine, reasons, provider)
  } catch {
    return decision(base.engine, 'METRICS_UNAVAILABLE_FAIL_SAFE')
  }
}
