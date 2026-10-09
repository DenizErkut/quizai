import test from 'node:test'
import assert from 'node:assert/strict'
import { FREE_TEACHER_LIMITS, TEACHER_INVITE_TARGET, countQualifyingStudents, decideFeature, decideTeacherAccess } from '../lib/teacher-entitlements'

const now = new Date('2026-10-09T10:00:00Z')
const future = '2027-06-01T00:00:00Z'
const base = { institutionLinked: false, profilePlan: 'none', planExpiresAt: null, grant: null, qualifyingStudents: 0, now }
const sub = (user_id: string, over: Record<string, unknown> = {}) => ({ user_id, plan: 'gold_yearly', status: 'active', price_paid: 4490, current_period_end: future, ...over })

test('independent teachers are limited by default', () => {
  assert.deepEqual(decideTeacherAccess(base), { tier: 'limited', source: 'limited', shouldGrant: false })
})

test('institution teachers, paid Altın/Platin and active grants are full', () => {
  assert.equal(decideTeacherAccess({ ...base, institutionLinked: true }).tier, 'full')
  assert.equal(decideTeacherAccess({ ...base, profilePlan: 'premium', planExpiresAt: future }).source, 'paid_plan')
  assert.equal(decideTeacherAccess({ ...base, profilePlan: 'unlimited', planExpiresAt: future }).tier, 'full')
  assert.equal(decideTeacherAccess({ ...base, grant: { expires_at: future } }).source, 'grant')
})

test('silver, expired plans and expired grants stay limited', () => {
  assert.equal(decideTeacherAccess({ ...base, profilePlan: 'silver', planExpiresAt: future }).tier, 'limited')
  assert.equal(decideTeacherAccess({ ...base, profilePlan: 'premium', planExpiresAt: '2026-01-01T00:00:00Z' }).tier, 'limited')
  assert.equal(decideTeacherAccess({ ...base, grant: { expires_at: '2026-10-01T00:00:00Z' } }).tier, 'limited')
})

test('ten qualifying students earn the grant exactly at the target', () => {
  assert.equal(decideTeacherAccess({ ...base, qualifyingStudents: TEACHER_INVITE_TARGET - 1 }).tier, 'limited')
  const earned = decideTeacherAccess({ ...base, qualifyingStudents: TEACHER_INVITE_TARGET })
  assert.deepEqual([earned.tier, earned.source, earned.shouldGrant], ['full', 'invite_gold', true])
})

test('only paid, active, yearly Altın/Platin students of someone else count, once each', () => {
  const subs = [
    sub('a'), sub('a'), sub('b', { plan: 'platinum_yearly' }), sub('c', { plan: 'yearly' }), // legacy alias of gold_yearly
    sub('d', { plan: 'gold_monthly' }), sub('e', { plan: 'silver_yearly' }),
    sub('f', { price_paid: 0 }), sub('g', { status: 'canceled' }), sub('h', { current_period_end: '2026-09-01T00:00:00Z' }),
    sub('teacher'),
  ]
  assert.equal(countQualifyingStudents(subs, 'teacher', now), 3)
})

test('free tier quotas: one AI generation ever, one live quiz a month, no export/import, no analytics', () => {
  const limited = { tier: 'limited' as const, source: 'limited' as const, shouldGrant: false }
  const none = { aiTotal: 0, liveThisMonth: 0 }
  assert.equal(decideFeature(limited, 'ai_generation', none).allowed, true)
  assert.equal(decideFeature(limited, 'ai_generation', { ...none, aiTotal: FREE_TEACHER_LIMITS.aiGenerations }).allowed, false)
  assert.equal(decideFeature(limited, 'live_quiz', { ...none, liveThisMonth: 1 }).allowed, false)
  assert.equal(decideFeature(limited, 'export_import', none).allowed, false)
  assert.equal(decideFeature(limited, 'analytics', none).allowed, false)
  const full = { tier: 'full' as const, source: 'grant' as const, shouldGrant: false }
  assert.equal(decideFeature(full, 'export_import', { aiTotal: 99, liveThisMonth: 99 }).allowed, true)
})
