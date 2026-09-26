import { expect, test } from '@playwright/test'
import {
  buildAdaptiveDifficultyQuota,
  evaluateStrictQuestionReview,
  formatDifficultyQuota,
  hasCanonicalObjectiveCoverage,
  hasDifficultyQuota,
  hasStrictQuestionReview,
  hasVisualQuota,
  requiredVisualCount,
  visualAttemptCount,
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
  expect(hasDifficultyQuota([
    { difficulty: 'kolay' }, { difficulty: 'kolay' }, { difficulty: 'kolay' },
    { difficulty: 'normal' }, { difficulty: 'normal' }, { difficulty: 'normal' },
    { difficulty: 'normal' }, { difficulty: 'zor' }, { difficulty: 'zor' }, { difficulty: 'zor' },
  ], buildAdaptiveDifficultyQuota(10, 'normal'))).toBe(true)
  expect(hasDifficultyQuota(Array.from({ length: 10 }, (_, i) => ({ difficulty: i === 0 ? 'kolay' : i === 9 ? 'zor' : 'normal' })), buildAdaptiveDifficultyQuota(10, 'normal'))).toBe(false)
})

test('requires at least half the questions to have a matched, QA-passed visual', () => {
  expect(requiredVisualCount(10)).toBe(3)
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

test('keeps auxiliary validators as vetoes without making an outage fatal', () => {
  const primary = { ok: true, difficultyMatches: true, objectiveMatches: true }
  expect(evaluateStrictQuestionReview({ primary, secondary: [null, undefined], objectiveRequired: true }).passed).toBe(true)
  expect(evaluateStrictQuestionReview({ primary, secondary: [{ ok: false }], objectiveRequired: true }).passed).toBe(true)
  expect(evaluateStrictQuestionReview({ primary, secondary: [{ ok: false }, { ok: false }], objectiveRequired: true }).passed).toBe(false)
  expect(evaluateStrictQuestionReview({ primary: { ok: false }, secondary: [{ ok: true }, null], objectiveRequired: true }).passed).toBe(true)
  // Older/temporarily degraded validators may return only {ok:true}; missing
  // optional evidence is unavailable, not a hard rejection.
  expect(evaluateStrictQuestionReview({ primary: { ok: true }, secondary: [], objectiveRequired: true }).passed).toBe(true)
})

test('generates spare visual candidates while preserving the relaxed quota', () => {
  expect(requiredVisualCount(10)).toBe(3)
  expect(visualAttemptCount(10)).toBe(5)
  expect(visualAttemptCount(2)).toBe(2)
  expect(visualAttemptCount(1)).toBe(1)
})
