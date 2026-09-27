import { expect, test } from '@playwright/test'
import {
  buildAdaptiveDifficultyQuota,
  buildQuestionGenerationPlan,
  evaluateStrictQuestionReview,
  filterQuestionsByRequestedType,
  formatDifficultyQuota,
  hasCanonicalObjectiveCoverage,
  hasDifficultyQuota,
  hasStrictQuestionReview,
  hasVisualQuota,
  minimumVerifiedQuestionCount,
  requiredVisualCount,
  normalizeRequestedQuestionType,
  visualAttemptCount,
} from '../lib/quiz-generation-policy'

test('defaults instant quiz requests to mixed and enforces an explicit format', () => {
  expect(normalizeRequestedQuestionType(undefined)).toBe('mixed')
  expect(normalizeRequestedQuestionType('unsupported')).toBe('mixed')
  expect(normalizeRequestedQuestionType('ordering')).toBe('ordering')

  const candidates = [
    { type: 'multiple_choice', q: 'A' },
    { type: 'ordering', q: 'B' },
    { type: 'fill_blank', q: 'C' },
    { type: 'mixed', q: 'invalid item type' },
  ]
  expect(filterQuestionsByRequestedType(candidates, 'ordering').map(question => question.q)).toEqual(['B'])
  expect(filterQuestionsByRequestedType(candidates, 'mixed').map(question => question.q)).toEqual(['A', 'B', 'C'])
})

test('uses the 50/20/20/10 provider difficulty mix', () => {
  expect(buildQuestionGenerationPlan(10)).toEqual([
    { provider: 'openai', difficulty: 'kolay', count: 5 },
    { provider: 'mistral', difficulty: 'normal', count: 2 },
    { provider: 'anthropic', difficulty: 'zor', count: 2 },
    { provider: 'anthropic', difficulty: 'cok zor', count: 1 },
  ])
})

test('adaptive quota preserves all difficulty levels and weights them by mastery', () => {
  const easy = buildAdaptiveDifficultyQuota(10, 'kolay')
  const normal = buildAdaptiveDifficultyQuota(10, 'normal')
  const hard = buildAdaptiveDifficultyQuota(10, 'zor')
  for (const quota of [easy, normal, hard]) {
    expect(quota.kolay).toBeGreaterThan(0)
    expect(quota.normal).toBeGreaterThan(0)
    expect(quota.zor).toBeGreaterThan(0)
    expect(quota['cok zor']).toBeGreaterThan(0)
    expect(quota.kolay + quota.normal + quota.zor + quota['cok zor']).toBe(10)
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
    ...Array.from({ length: quota['cok zor'] }, () => ({ difficulty: 'cok zor' })),
  ]
  expect(formatDifficultyQuota(quota)).toContain('zor:')
  expect(hasDifficultyQuota(questions, quota)).toBe(true)
  expect(hasDifficultyQuota([...questions.slice(0, -1), { difficulty: 'bilinmeyen' }], quota)).toBe(false)
  expect(hasDifficultyQuota([
    { difficulty: 'kolay' }, { difficulty: 'kolay' }, { difficulty: 'kolay' },
    { difficulty: 'normal' }, { difficulty: 'normal' }, { difficulty: 'normal' },
    { difficulty: 'normal' }, { difficulty: 'zor' }, { difficulty: 'zor' }, { difficulty: 'zor' },
  ], buildAdaptiveDifficultyQuota(10, 'normal'))).toBe(true)
  expect(hasDifficultyQuota(Array.from({ length: 10 }, (_, i) => ({ difficulty: i === 0 ? 'kolay' : i === 9 ? 'zor' : 'normal' })), buildAdaptiveDifficultyQuota(10, 'normal'))).toBe(false)
})

test('requires thirty percent matched visuals with a seventy percent QA score', () => {
  expect(requiredVisualCount(10)).toBe(3)
  const valid = (q: string) => ({
    q,
    svg: '<svg viewBox="0 0 1 1"></svg>',
    visualQuestionText: q,
    visualContextQuality: { score: 70, evaluator: 'openai' },
  })
  const questions = [valid('Q1'), valid('Q2'), valid('Q3'),
    { ...valid('Q4'), visualQuestionText: 'different question' },
    { ...valid('Q5'), visualContextQuality: { score: 69, evaluator: 'openai' } },
    { ...valid('Q6'), svg: 'not svg' }]
  expect(hasVisualQuota(questions, 3)).toBe(true)
  expect(hasVisualQuota(questions, 4)).toBe(false)
})

test('keeps the seventy-percent quality target usable for small batches', () => {
  expect(minimumVerifiedQuestionCount(0)).toBe(0)
  expect(minimumVerifiedQuestionCount(1)).toBe(1)
  expect(minimumVerifiedQuestionCount(2)).toBe(1)
  expect(minimumVerifiedQuestionCount(3)).toBe(2)
  expect(minimumVerifiedQuestionCount(10)).toBe(7)
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
