import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateAiUsage, aiCostAlertConfigFromEnv, DEFAULT_AI_COST_ALERT_CONFIG, type AiUsageRow } from '../lib/ai-cost-alert'

const now = new Date('2026-10-21T06:10:00.000Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString()
const row = (hours: number, cost: number, user: string | null = 'u1', provider = 'mistral'): AiUsageRow => ({ created_at: hoursAgo(hours), provider, cost_usd: cost, user_id: user })

test('normal usage produces no alerts', () => {
  const rows = [row(2, 0.3), row(30, 0.4), row(100, 0.5)]
  const result = evaluateAiUsage(rows, now)
  assert.deepEqual(result.alerts, [])
  assert.ok(Math.abs(result.last24hUsd - 0.3) < 1e-9)
})

test('daily cost above the limit alerts with a provider breakdown', () => {
  const result = evaluateAiUsage([row(1, 4, 'u1', 'anthropic'), row(2, 2, 'u2', 'mistral')], now)
  const alert = result.alerts.find(a => a.key === 'daily_limit')
  assert.ok(alert)
  assert.match(alert!.body, /6\.00 \$/)
  assert.match(alert!.body, /anthropic 4\.00 \$/)
})

test('spike alert needs a baseline, a minimum spend and a multiple of the weekly average', () => {
  const baseline = Array.from({ length: 7 }, (_, day) => row(30 + day * 24, 0.2))   // ~0.2 $/gün
  assert.ok(evaluateAiUsage([...baseline, row(1, 1.5)], now).alerts.some(a => a.key === 'spike'))
  assert.ok(!evaluateAiUsage([...baseline, row(1, 0.5)], now).alerts.some(a => a.key === 'spike'))   // eşik altı tutar
  assert.ok(!evaluateAiUsage([row(1, 2)], now).alerts.some(a => a.key === 'spike'))                 // taban yok
})

test('a single user with too many calls alerts without exposing the full id', () => {
  const userId = '12345678-aaaa-bbbb-cccc-1234567890ab'
  const rows = Array.from({ length: 400 }, () => row(3, 0, userId))
  const alert = evaluateAiUsage(rows, now).alerts.find(a => a.key.startsWith('user_calls'))
  assert.ok(alert)
  assert.equal(alert!.key, 'user_calls:12345678')
  assert.ok(!alert!.body.includes(userId))
})

test('rows outside the window, in the future or with bad values are ignored; env overrides are validated', () => {
  const rows: AiUsageRow[] = [row(-5, 50), row(400, 50), { created_at: 'bozuk', provider: null, cost_usd: 9, user_id: null }, row(1, Number.NaN as unknown as number)]
  assert.deepEqual(evaluateAiUsage(rows, now).alerts, [])
  assert.deepEqual(aiCostAlertConfigFromEnv({}), DEFAULT_AI_COST_ALERT_CONFIG)
  assert.equal(aiCostAlertConfigFromEnv({ AI_DAILY_COST_ALERT_USD: '12' }).dailyLimitUsd, 12)
  assert.equal(aiCostAlertConfigFromEnv({ AI_DAILY_COST_ALERT_USD: '-3', AI_USER_DAILY_CALLS_ALERT: 'x' }).dailyLimitUsd, 5)
})
