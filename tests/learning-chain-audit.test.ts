import test from 'node:test'
import assert from 'node:assert/strict'
import { auditChains, type ChainAttempt } from '../lib/learning-chain-audit'

const cycle = { id: 'c1', student_id: 's1', learning_objective_id: 'o1', status: 'active', created_at: '2026-10-01T00:00:00Z' }
const attempt = (stage: ChainAttempt['stage'], at: string | null, session: string): ChainAttempt =>
  ({ cycle_id: 'c1', stage, status: at ? 'completed' : 'started', completed_at: at, score_pct: at ? 50 : null, quiz_session_id: session })

test('reports the first missing link and keeps the delayed-check pipeline separate', () => {
  const result = auditChains({
    cycles: [cycle],
    attempts: [attempt('baseline', '2026-10-01T10:00:00Z', 'q1'), attempt('post', '2026-10-03T10:00:00Z', 'q2')],
    guided: [{ cycle_id: 'c1', status: 'completed', completed_at: '2026-10-02T10:00:00Z' }],
    reviews: [], delayed: [{ student_id: 's1', learning_objective_id: 'o1', status: 'completed' }],
  })
  const row = result.rows[0]
  assert.equal(row.firstMissing, 'teacher_review_pair')
  assert.equal(row.complete, false)
  assert.deepEqual(row.delayedChecks, { total: 1, completed: 1 })
  assert.equal(result.totals.byLink.post, 1)
  assert.equal(result.totals.completeChains, 0)
})

test('a full chain is complete and a teacher review must match the sessions', () => {
  const attempts = [attempt('baseline', '2026-10-01T10:00:00Z', 'q1'), attempt('post', '2026-10-03T10:00:00Z', 'q2'), attempt('transfer', '2026-10-05T10:00:00Z', 'q3')]
  const guided = [{ cycle_id: 'c1', status: 'completed', completed_at: '2026-10-02T10:00:00Z' }]
  const unrelated = { pre_session_id: 'x', post_session_id: 'y', transfer_session_id: null, reviewed_at: '2026-10-04T00:00:00Z', transfer_reviewed_by: null, transfer_reviewed_at: null }
  assert.equal(auditChains({ cycles: [cycle], attempts, guided, reviews: [unrelated], delayed: [] }).rows[0].firstMissing, 'teacher_review_pair')
  const reviews = [{ pre_session_id: 'q1', post_session_id: 'q2', transfer_session_id: 'q3', reviewed_at: '2026-10-04T00:00:00Z', transfer_reviewed_by: 'u1', transfer_reviewed_at: '2026-10-06T00:00:00Z' }]
  const full = auditChains({ cycles: [{ ...cycle, status: 'completed' }], attempts, guided, reviews, delayed: [] })
  assert.equal(full.rows[0].complete, true)
  assert.deepEqual(full.rows[0].warnings, [])
})

test('flags pre/post gaps outside 1–90 days, out-of-order stages and closed cycles with gaps', () => {
  const result = auditChains({
    cycles: [{ ...cycle, status: 'completed' }],
    attempts: [attempt('baseline', '2026-10-01T10:00:00Z', 'q1'), attempt('post', '2026-10-01T18:00:00Z', 'q2')],
    guided: [{ cycle_id: 'c1', status: 'completed', completed_at: '2026-10-02T10:00:00Z' }], reviews: [], delayed: [],
  })
  assert.deepEqual([...result.rows[0].warnings].sort(), ['cycle_completed_with_missing_links', 'out_of_order', 'pre_post_gap_out_of_range'])
})
