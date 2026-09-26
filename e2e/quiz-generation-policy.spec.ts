import { expect, test } from '@playwright/test'
import {
  buildAdaptiveDifficultyQuota,
  formatDifficultyQuota,
  hasCanonicalObjectiveCoverage,
  hasDifficultyQuota,
  hasStrictQuestionReview,
  hasVisualQuota,
  requiredVisualCount,
} from '../lib/quiz-generation-policy'

test('adaptive quota preserves all difficulty levels and weights them by mastery', () => {
  const easy = buildAdaptiveDifficultyQuota(10, 'kolay')
  const normal = buildAdaptiveDifficultyQuota(10, 'normal')
  const hard = buildAdaptiveDifficultyQuota(10, 'zor')
  for (const quota of [easy, normal, hard]) {
    expect(quota.kolay).toBeGreaterThan(0)
    expect(quota.normal).toBeGreaterThan(0)
    expect(quota.zor).toBeGreaterThan(0)
    expect(quota.kolay + quota.normal + quota.zor).toBe(10)
  }
  expect(easy.kolay).toBeGreaterThan(hard.kolay)
  expect(hard.zor).toBeGreaterThan(easy.zor)
})

test('rejects missing, mislabeled, or incorrect difficulty distribution', () => {
  const quota = buildAdaptiveDifficultyQuota(5, 'normal')
  const questions = [
    ...Array.from({ length: quota.kolay }, () => ({ difficulty: 'kolay' })),
    ...Array.from({ length: quota.normal }, () => ({ difficulty: 'normal' })),
    ...Array.from({ length: quota.zor }, () => ({ difficulty: 'zor' })),
  ]
  expect(formatDifficultyQuota(quota)).toContain('zor:')
  expect(hasDifficultyQuota(questions, quota)).toBe(true)
  expect(hasDifficultyQuota([...questions.slice(0, -1), { difficulty: 'kolay' }], quota)).toBe(false)
})

test('requires at least half the questions to have a matched, QA-passed visual', () => {
  expect(requiredVisualCount(10)).toBe(5)
  const valid = (q: string) => ({
    q,
    svg: '<svg viewBox="0 0 1 1"></svg>',
    visualQuestionText: q,
    visualContextQuality: { score: 90, evaluator: 'openai' },
  })
  const questions = [valid('Q1'), valid('Q2'), valid('Q3'),
    { ...valid('Q4'), visualQuestionText: 'different question' },
    { ...valid('Q5'), visualContextQuality: { score: 89, evaluator: 'openai' } },
    { ...valid('Q6'), svg: 'not svg' }]
  expect(hasVisualQuota(questions, 3)).toBe(true)
  expect(hasVisualQuota(questions, 4)).toBe(false)
})

test('requires each item to map to an approved canonical outcome and have strict-review evidence', () => {
  const candidates = [{ id: 'approved-1' }]
  const approvedQuestion = {
    objectiveMappingStatus: 'mapped', learningObjectiveId: 'approved-1', learningObjectiveCode: 'MAT.9.1.1',
    qualityVerificationVersion: 'quiz-quality-v2', difficultyVerified: true, objectiveVerified: true,
  }
  expect(hasCanonicalObjectiveCoverage([approvedQuestion], candidates)).toBe(true)
  expect(hasStrictQuestionReview([approvedQuestion], candidates)).toBe(true)
  expect(hasCanonicalObjectiveCoverage([{ ...approvedQuestion, learningObjectiveId: 'invented' }], candidates)).toBe(false)
  expect(hasStrictQuestionReview([{ ...approvedQuestion, objectiveVerified: false }], candidates)).toBe(false)
})
