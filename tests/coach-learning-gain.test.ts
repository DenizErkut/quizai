import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeCoachGain, type CoachGainRow } from '../lib/coach-learning-gain'

const row = (objective: string, gain: number, date: string, transfer: number | null = null): CoachGainRow => ({
  student_id: 'student', learning_objective_id: objective, gain_pp: gain, transfer_gain_pp: transfer,
  pre_score_pct: 40, post_score_pct: 40 + gain, post_completed_at: date,
})

test('koç en güncel öğrenci-kazanım çiftini sayar', () => {
  const summary = summarizeCoachGain([row('objective', -20, '2026-01-01'), row('objective', 20, '2026-02-01')], { objective: 'MAT.7.1' })
  assert.equal(summary.recordedPairs, 2)
  assert.equal(summary.currentPairs, 1)
  assert.equal(summary.objectives[0].latestGainPp, 20)
  assert.equal(summary.averageGainPp, null)
})

test('aktarımı yalnız mevcut kanıt varsa sayar', () => {
  const summary = summarizeCoachGain([row('a', 10, '2026-02-01', 5), row('b', 0, '2026-02-02')], {})
  assert.equal(summary.transferPairs, 1)
  assert.equal(summary.currentPairs, 2)
  assert.equal(summary.verifiedTransferPairs, 0)
})

test('yalnız sunucuda puanlanan aktarım doğrulanmış olarak sayılır', () => {
  const verified = { ...row('a', 10, '2026-02-01', 5), measurement_version: 'learning-gain-v2-server-scored-transfer' }
  const summary = summarizeCoachGain([verified, row('b', 10, '2026-02-01', 5)], {})
  assert.equal(summary.transferPairs, 2)
  assert.equal(summary.verifiedTransferPairs, 1)
})

test('ortalama en az beş çiftte görünür', () => {
  const summary = summarizeCoachGain([1, 2, 3, 4, 5].map(n => row(String(n), 10, '2026-02-01')), {})
  assert.equal(summary.averageGainPp, 10)
})
