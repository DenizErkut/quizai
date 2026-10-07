import test from 'node:test'
import assert from 'node:assert/strict'
import { buildQuestionGenerationPlan, missingRoleBatches, roleBatchMaxTokens } from '../lib/quiz-generation-policy'

const plan = buildQuestionGenerationPlan(10) // openai 5, mistral 2, anthropic zor 2, anthropic cok zor 1
const q = (generationProvider: string, difficulty: string) => ({ generationProvider, difficulty })

test('a short anthropic batch is detected even though two plan batches share the provider', () => {
  const delivered = [...Array(5).fill(0).map(() => q('openai', 'kolay')), q('mistral', 'normal'), q('mistral', 'normal'),
    q('anthropic', 'zor'), q('anthropic', 'cok zor')]
  assert.deepEqual(missingRoleBatches(plan, delivered, 1), [{ provider: 'anthropic', difficulty: 'zor', count: 1 }])
})

test('never asks for more than is missing and covers mislabelled difficulties', () => {
  const delivered = Array(9).fill(0).map(() => q('openai', 'kolay'))
  const batches = missingRoleBatches(plan, delivered, 1)
  assert.equal(batches.reduce((sum, batch) => sum + batch.count, 0), 1)
  const mislabelled = Array(9).fill(0).map(() => q('anthropic', 'weird'))
  assert.equal(missingRoleBatches(plan, mislabelled, 1).reduce((sum, batch) => sum + batch.count, 0), 1)
  assert.deepEqual(missingRoleBatches(plan, [], 0), [])
})

test('output budget leaves room for visual questions', () => {
  assert.equal(roleBatchMaxTokens(2), 3000)
  assert.equal(roleBatchMaxTokens(5), 5000)
  assert.equal(roleBatchMaxTokens(20), 8000)
})
