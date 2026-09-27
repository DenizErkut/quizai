import { createClient } from '@/lib/supabase/server-create-client'
import { isProviderConfigured } from './model-registry'
import { pickQuizEngine, type ForceProvider, type QuizRoutingDecision } from './quiz-provider-router'

type ProviderKey = 'openai' | 'mistral' | 'anthropic'
type Metric = { provider: ProviderKey; calls: number; qualitySample: number; successRate: number | null; costPerCall: number | null; p95Ms: number | null }

export type MeasuredQuizDecision = QuizRoutingDecision & {
  policyVersion: 'measured-router-v1'
  routingReason: string
  measuredProvider?: ProviderKey
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
  const { data, error } = await db.from('ai_usage_logs')
    .select('provider,cost_usd,duration_ms,meta').gte('created_at', since).limit(30000)
  if (error) throw error

  const groups = new Map<ProviderKey, { calls: number; costs: number; priced: number; durations: number[]; success: number; failed: number }>()
  for (const row of data || []) {
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
    const status = Number(meta.status)
    const evidenced = Boolean(outcome) || Number.isFinite(status)
    const failed = outcome.includes('error') || outcome.includes('fail') || (Number.isFinite(status) && status >= 400)
    if (evidenced) failed ? group.failed++ : group.success++
    groups.set(provider, group)
  }

  const metrics = [...groups.entries()].map(([provider, group]) => {
    group.durations.sort((a, b) => a - b)
    const qualitySample = group.success + group.failed
    return {
      provider,
      calls: group.calls,
      qualitySample,
      successRate: qualitySample ? group.success / qualitySample : null,
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
  const protectedDecision = Boolean(opts.forceProvider) || opts.hardDifficulty === true || opts.pilotEligible === false
  if (protectedDecision) return { ...base, policyVersion: 'measured-router-v1', routingReason: 'ROLE_OR_MANUAL_POLICY_PROTECTED' }

  try {
    const metrics = await loadMetrics()
    const provider = providerForEngine(base.engine)
    const current = metrics.find(metric => metric.provider === provider)
    if (!current || current.calls < 20 || current.qualitySample < 10) {
      return { ...base, policyVersion: 'measured-router-v1', routingReason: 'INSUFFICIENT_MEASURED_SAMPLE', measuredProvider: provider }
    }

    const comparable = metrics.filter(metric => metric.provider !== provider && metric.calls >= 20 && metric.qualitySample >= 10 && metric.successRate !== null && metric.successRate >= 0.7)
    const cheapestComparable = comparable.filter(metric => metric.costPerCall !== null).sort((a, b) => (a.costPerCall || 0) - (b.costPerCall || 0))[0]
    const qualityBlocked = current.successRate !== null && current.successRate < 0.7
    const latencyBlocked = current.p95Ms !== null && current.p95Ms > 90_000
    const costBlocked = Boolean(current.costPerCall !== null && cheapestComparable?.costPerCall !== null
      && current.costPerCall > cheapestComparable.costPerCall * 2.5
      && (current.successRate || 0) <= (cheapestComparable.successRate || 0) + 0.02)
    if (!qualityBlocked && !latencyBlocked && !costBlocked) {
      return { ...base, policyVersion: 'measured-router-v1', routingReason: 'MEASURED_PROVIDER_HEALTHY', measuredProvider: provider }
    }

    const forcedFallback = fallbackProvider(provider)
    if (!forcedFallback) return { ...base, policyVersion: 'measured-router-v1', routingReason: 'NO_CONFIGURED_SAFE_FALLBACK', measuredProvider: provider }
    const fallback = pickQuizEngine({ ...opts, forceProvider: forcedFallback })
    const reasons = [qualityBlocked && 'QUALITY_BELOW_70', latencyBlocked && 'P95_ABOVE_90S', costBlocked && 'COST_OUTLIER'].filter(Boolean).join('+')
    return { ...fallback, genEngineTag: `${fallback.genEngineTag}-measured-fallback`, policyVersion: 'measured-router-v1', routingReason: reasons, measuredProvider: provider }
  } catch {
    return { ...base, policyVersion: 'measured-router-v1', routingReason: 'METRICS_UNAVAILABLE_FAIL_SAFE' }
  }
}
