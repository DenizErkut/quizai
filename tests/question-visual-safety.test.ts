import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('soru görselleri uygulama belgesine çalıştırılabilir SVG enjekte etmez', () => {
  const source = readFileSync('components/quiz/QuizQuestion.tsx', 'utf8')
  assert.equal(source.includes('dangerouslySetInnerHTML'), false)
  assert.ok(source.includes('data:image/svg+xml;charset=utf-8,${encodeURIComponent(q.svg)}'))
})
