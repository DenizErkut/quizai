import test from 'node:test'
import assert from 'node:assert/strict'
import { minimumNormalTestCount } from '../lib/quiz-generation-policy'

test('normal tests may be at most ~20% shorter than requested; tiny tests stay exact', () => {
  assert.deepEqual([0, 1, 2].map(minimumNormalTestCount), [0, 1, 2])
  assert.equal(minimumNormalTestCount(3), 2)
  assert.equal(minimumNormalTestCount(5), 4)
  assert.equal(minimumNormalTestCount(8), 6)
  assert.equal(minimumNormalTestCount(10), 8)
  assert.equal(minimumNormalTestCount(20), 16)
})

test('the failures seen in production (9/10, 8/10, 4/5) are all deliverable now', () => {
  for (const [delivered, requested] of [[9, 10], [8, 10], [4, 5]]) assert.ok(delivered >= minimumNormalTestCount(requested))
  assert.ok(!(3 >= minimumNormalTestCount(5)))
})
