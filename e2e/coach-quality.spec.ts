import { expect, test } from '@playwright/test'
import { summarizeCoachHistory, type CoachSession } from '../lib/coach-context'
import { isPaidCoachPlan } from '../lib/coach-access'
import { decideQuizProvider, getQuizProviderPolicy } from '../lib/quiz-provider-policy'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const NOW = Date.parse('2026-09-22T12:00:00Z')
const session = (daysAgo: number, topic: string, pct: number): CoachSession => ({
  topic, pct, score: Math.round(pct / 10), questionCount: 10,
  createdAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
})

test('koç geçmişi haftaları ve konu sinyallerini gerçek oturumlardan özetler', () => {
  const result = summarizeCoachHistory([
    session(1, 'Denklemler', 80), session(3, 'Denklemler', 70),
    session(8, 'Denklemler', 50), session(10, 'Geometri', 60),
  ], NOW)
  expect(result.last7Days).toEqual({ sessions: 2, questions: 20, averagePct: 75 })
  expect(result.previous7Days.averagePct).toBe(55)
  expect(result.trend).toBe('improving')
  expect(result.trendPctPoints).toBe(20)
  expect(result.topics[0].topic).toBe('Denklemler')
})

test('ölçümlü sağlayıcı politikası GPT gövde, Claude kontrol ve Mistral kapalıdır', () => {
  const policy = getQuizProviderPolicy({} as NodeJS.ProcessEnv)
  expect(policy.gptFraction).toBe(0.9)
  expect(policy.mistralFraction).toBe(0)
  expect(policy.claudeHoldoutFraction).toBeCloseTo(0.1)
  expect(decideQuizProvider({ bucket: 100, hard: false, mistralConfigured: true, policy })).toBe('openai')
  expect(decideQuizProvider({ bucket: 9500, hard: false, mistralConfigured: true, policy })).toBe('claude')
  expect(decideQuizProvider({ bucket: 100, hard: true, mistralConfigured: true, policy })).toBe('claude')
})

test('koç ve sıralama APIleri anonim erişimi reddeder', async ({ request }) => {
  expect((await request.get('/api/coach/chat')).status()).toBe(401)
  expect((await request.get('/api/leaderboard')).status()).toBe(401)
  expect((await request.post('/api/coach/speech', { data: { messageId: '00000000-0000-0000-0000-000000000000' } })).status()).toBe(401)
})

test('koç cron uçları secret olmadan çalışmaz', async ({ request }) => {
  expect((await request.get('/api/cron/coach-nudge-enqueue')).status()).toBe(401)
  expect((await request.get('/api/cron/coach-proactive-nudge')).status()).toBe(401)
  expect((await request.get('/api/cron/coach-nudge-enqueue', { headers: { authorization: 'Bearer invalid' } })).status()).toBe(401)
  expect((await request.get('/api/cron/coach-proactive-nudge', { headers: { authorization: 'Bearer invalid' } })).status()).toBe(401)
})

test('koç yalnızca ücretli planları kuyruğa alır', () => {
  expect(isPaidCoachPlan('silver')).toBe(true)
  expect(isPaidCoachPlan('premium')).toBe(true)
  expect(isPaidCoachPlan('unlimited')).toBe(true)
  expect(isPaidCoachPlan('free')).toBe(false)
  expect(isPaidCoachPlan(null)).toBe(false)
})

test('koç kuyruğu migrationı batch cursor, SKIP LOCKED ve lease recovery kurallarını korur', () => {
  const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260923184647_harden_coach_nudge_batching_and_advisors.sql'), 'utf8')
  expect(migration).toContain('coach_nudge_enqueue_state')
  expect(migration).toContain('enqueue_coach_nudge_jobs')
  expect(migration).toContain('FOR UPDATE SKIP LOCKED')
  expect(migration).toContain("locked_at < pg_catalog.now() - interval '5 minutes'")
  expect(migration).toContain('v_limit integer := LEAST(GREATEST(COALESCE(p_batch_size, 500), 1), 1000)')
  expect(migration).toContain('referrals_qualified_subscription_id_idx')
  expect(migration).toContain('DROP INDEX IF EXISTS public.referrals_one_referrer_per_referred_uidx')
})
