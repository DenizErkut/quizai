import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

test('adaptive continuation requests a three-question validated reserve', () => {
  const page = readFileSync(join(process.cwd(), 'app/quiz/page.tsx'), 'utf8')
  expect(page).toContain('Math.min(3, Math.max(1, qCount - questions.length))')
  expect(page).toContain('adaptiveCandidateBatch: true')
  expect(page).toContain('if (secondChunk.length === 0 && sessionId)')
  expect(page).not.toContain('Bağlantıyı kontrol edip testi yeniden başlatabilirsin.')
})

test('only adaptive continuation may accept a non-empty verified subset', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/generate-quiz/route.ts'), 'utf8')
  expect(route).toContain("body?.adaptiveCandidateBatch === true")
  expect(route).toContain("typeof body?.continueSessionId === 'string'")
  expect(route).toContain('adaptiveCandidateBatch && verifiedCandidateCount > 0')
  expect(route).toContain('adaptiveCandidateBatch && questions.length > 0')
  expect(route).toContain('combinedMinimum = requiredVisualCount(existingQuestions.length + safeQCount)')
  expect(route).toContain('batchVisualMinimum = Math.max(0, combinedMinimum - existingVisualCount)')
})

test('a primary rejection receives an independent second opinion and is audited', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/verify-questions/route.ts'), 'utf8')
  expect(route).toContain('primaryCheck?.ok === false')
  expect(route).toContain('await verifyQuestionWithGemini(verifyPrompt)')
  expect(route).toContain('verifyQuestionWithClaude(verifyPrompt)')
  expect(route).toContain('objectiveCandidates.length === 1')
  expect(route).toContain('strictQualityPolicy && verified.length > 0')
  expect(route).toContain('two_provider_rejection')
  expect(route).toContain('rejection_details: rejectionDetails')
})
