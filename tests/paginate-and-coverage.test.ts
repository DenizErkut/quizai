import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllRows } from '../lib/paginate'
import { sameGradeAndSubject } from '../lib/curriculum-keys'
import { computeCurriculumCoverage, deriveTopics } from '../lib/curriculum-coverage'

const table = Array.from({ length: 3622 }, (_, i) => i)
const serverPage = (cap: number) => async (from: number, to: number) => ({ data: table.slice(from, Math.min(to + 1, from + cap)), error: null })

test('fetchAllRows reads past a server row cap', async () => {
  assert.equal((await fetchAllRows(serverPage(1000))).length, 3622)
  assert.equal((await fetchAllRows(serverPage(500))).length, 3622)
})

test('fetchAllRows surfaces errors and runaway tables', async () => {
  await assert.rejects(fetchAllRows(async () => ({ data: null, error: { message: 'boom' } })), /boom/)
  await assert.rejects(fetchAllRows(serverPage(1000), { maxRows: 2000 }), /more than/)
})

test('grade-less rows never match each other', () => {
  assert.equal(sameGradeAndSubject({ grade: 'Hazırlık', subject: 'İngilizce' }, { grade: 'Mezun', subject: 'İngilizce' }), false)
  assert.equal(sameGradeAndSubject({ grade: 'Lise 9', subject: 'Fizik' }, { grade: '9. sınıf', subject: 'fizik' }), true)
})

const obj = (grade: string, subject: string, topic: string, extra = {}) =>
  ({ grade, subject, topic, unit: null, is_active: true, verification_status: 'verified', lifecycle_status: 'active', ...extra })

test('coverage separates current, other, orphan and missing', () => {
  const curriculum = [
    { id: '1', grade: '9. sınıf', subject: 'Fizik', topics: [] },
    { id: '2', grade: '9. sınıf', subject: 'Hayat Bilgisi', topics: [] },
    { id: '3', grade: '10. sınıf', subject: 'Fizik', topics: ['Kuvvet'] },
    { id: '4', grade: 'Hazırlık', subject: 'İngilizce', topics: [] },
  ]
  const objectives = [obj('9. sınıf', 'Fizik', 'Kuvvet'), obj('9. sınıf', 'Fizik', 'Hareket', { is_active: false, verification_status: 'draft' }),
    obj('10. sınıf', 'Fizik', 'Kuvvet'), obj('11. sınıf', 'Kimya', 'Atom')]
  const result = computeCurriculumCoverage(curriculum, objectives)
  const status = Object.fromEntries(result.rows.map(r => [r.id, r.status]))
  assert.deepEqual(status, { 1: 'needs_backfill', 2: 'no_catalog_match', 3: 'ok', 4: 'ambiguous_grade' })
  assert.equal(result.rows[0].otherObjectives, 1)
  assert.deepEqual(deriveTopics(curriculum[0], objectives), ['Kuvvet'])
  assert.equal(result.orphanGroups.length, 1)
  assert.equal(result.totals.otherObjectives, 1)
})

import { buildScorecard } from '../lib/safety-scorecard'

test('scorecard never scores unmeasured areas', () => {
  const card = buildScorecard({ audits: [], approvals: [], transfers: [], periodDays: 30 })
  assert.equal(card.overall, null)
  assert.equal(card.status, 'insufficient_evidence')
  assert.ok(card.dimensions.every(d => d.score === null && d.reason))
  assert.ok(card.dimensions.some(d => d.key === 'privacy_access'))
})

test('scorecard scores only what has a denominator and blocked outputs never raise it', () => {
  const at = '2026-10-01T00:00:00Z'
  const audits = Array.from({ length: 4 }, (_, i) => ({ policy_version: i < 3 ? 'v1' : null, decision_summary: { blocked: true }, agent_name: 'a', created_at: at }))
  const card = buildScorecard({ audits, approvals: [{ status: 'approved', created_at: at }, { status: 'pending', created_at: at }], transfers: [{ status: 'pending', created_at: at }], periodDays: 30 })
  const byKey = Object.fromEntries(card.dimensions.map(d => [d.key, d]))
  assert.equal(byKey.governance.score, 75)
  assert.equal(byKey.human_oversight.score, 50)
  assert.equal(byKey.learning_integrity.score, 0)
  assert.equal(byKey.content_safety.score, null)
  assert.equal(card.overall, 42)
  assert.equal(card.coverage.measured, 3)
  assert.equal(card.status, 'action_required')
})

import { readAll } from '../lib/paginate'

test('readAll pages a builder in a total order and reports errors like a response', async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }))
  const orders: string[] = []
  const builder = () => {
    const state = { cols: [] as string[] }
    const api = {
      order(column: string) { state.cols.push(column); orders.push(column); return api },
      range(from: number, to: number) { return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null }) },
    }
    return api
  }
  const result = await readAll(builder, ['a', 'b'])
  assert.equal(result.data.length, 2500)
  assert.equal(result.error, null)
  assert.ok(orders.includes('a') && orders.includes('b'))
  const failing = await readAll(() => ({ order() { return this }, range: () => Promise.resolve({ data: null, error: { message: 'nope' } }) }))
  assert.deepEqual(failing, { data: [], error: { message: 'nope' } })
})
