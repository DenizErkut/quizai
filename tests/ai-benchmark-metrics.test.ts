import test from 'node:test'
import assert from 'node:assert/strict'
import { bootstrapCI, costUsd, macroF1, pairedNonInferiority, percentile, precisionRecallF1, quadraticWeightedKappa, topKAccuracy, validateJsonShape } from '../lib/ai-benchmark/metrics'

test('yüzdelik ve top-k', () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10)
  assert.equal(percentile([5], 95), 5)
  assert.equal(topKAccuracy([['a', 'b'], ['c', 'a']], ['a', 'a'], 1), 0.5)
  assert.equal(topKAccuracy([['a', 'b'], ['c', 'a']], ['a', 'a'], 2), 1)
})

test('F1 ve makro F1', () => {
  const r = precisionRecallF1([true, true, false, false], [true, false, true, false])
  assert.equal(r.precision, 0.5); assert.equal(r.recall, 0.5); assert.equal(r.f1, 0.5)
  assert.equal(macroF1(['a', 'b', 'a', 'b'], ['a', 'b', 'a', 'b']), 1)
})

test('QWK: tam uyum 1, ters uyum düşük', () => {
  assert.equal(quadraticWeightedKappa([0, 1, 2, 3], [0, 1, 2, 3], 0, 3), 1)
  assert.ok(quadraticWeightedKappa([0, 1, 2, 3], [3, 2, 1, 0], 0, 3) < 0)
})

test('bootstrap tekrarlanabilir; aşağı-olmama kararı', () => {
  const a = bootstrapCI([0.8, 0.9, 0.7, 0.85, 0.95]); const b = bootstrapCI([0.8, 0.9, 0.7, 0.85, 0.95])
  assert.deepEqual(a, b)
  const reference = Array.from({ length: 200 }, (_, i) => (i % 5 === 0 ? 0 : 1))
  assert.equal(pairedNonInferiority(reference, reference, 0.02).nonInferior, true)
  const worse = reference.map((v, i) => (i % 2 === 0 ? 0 : v))
  assert.equal(pairedNonInferiority(worse, reference, 0.02).nonInferior, false)
})

test('JSON şema ve maliyet', () => {
  assert.equal(validateJsonShape('{"q":"x","ans":1,"opts":["a"]}', { q: 'string', ans: 'number', opts: 'array' }), true)
  assert.equal(validateJsonShape('{"q":"x"}', { q: 'string', ans: 'number' }), false)
  assert.equal(validateJsonShape('```json\n{}\n```', {}), false)
  assert.equal(costUsd(200_000, 40_000, 0.15, 0.6), 0.054)
})
