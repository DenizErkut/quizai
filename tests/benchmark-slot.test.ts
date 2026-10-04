import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextBenchmarkOrdinal } from '../lib/benchmark-slot'

test('49/50 set with deleted ordinal 14 accepts the replacement in slot 14', () => {
  assert.equal(nextBenchmarkOrdinal(Array.from({ length: 50 }, (_, i) => i + 1).filter(i => i !== 14), 50), 14)
})
test('full sets refuse additions; empty and multiple-hole sets pick first free slot', () => {
  assert.equal(nextBenchmarkOrdinal(Array.from({ length: 50 }, (_, i) => i + 1), 50), null)
  assert.equal(nextBenchmarkOrdinal([], 50), 1)
  assert.equal(nextBenchmarkOrdinal([1, 3, 50], 50), 2)
})
