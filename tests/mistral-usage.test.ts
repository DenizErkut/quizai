import test from 'node:test'
import assert from 'node:assert/strict'
import { splitMistralUsage } from '../lib/mistral-usage'

test('mistral usage separates cached prompt tokens from billable input', () => {
  assert.deepEqual(
    splitMistralUsage({ prompt_tokens: 13_560_000, completion_tokens: 1_620_000, prompt_tokens_details: { cached_tokens: 9_430_000 } }),
    { promptTokens: 13_560_000, inputTokens: 4_130_000, outputTokens: 1_620_000, cacheReadTokens: 9_430_000 },
  )
})

test('mistral usage without cache details keeps the whole prompt as input and tolerates bad values', () => {
  assert.deepEqual(splitMistralUsage({ prompt_tokens: 100, completion_tokens: 20 }), { promptTokens: 100, inputTokens: 100, outputTokens: 20, cacheReadTokens: 0 })
  assert.deepEqual(splitMistralUsage(undefined), { promptTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 })
  assert.equal(splitMistralUsage({ prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 50 } }).inputTokens, 0)
})
