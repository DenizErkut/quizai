import { expect, test } from '@playwright/test'
import manifest from '../data/evals/meb/question-benchmark-v1.json'
import { runMebEvalCase, summarizeMebEvalResults, validateMebEvalCase, type MebEvalCase } from '../lib/meb-eval-suite'

const cases = manifest.cases as MebEvalCase[]

test('MEB eval manifest is source-traceable and does not invent teacher approval', () => {
  expect(manifest.schemaVersion).toBe('meb-question-eval-v1')
  expect(cases.length).toBeGreaterThan(0)
  for (const testCase of cases) {
    expect(validateMebEvalCase(testCase)).toEqual([])
  }
  expect(cases.every(testCase => testCase.reviewStatus !== 'approved')).toBe(true)
})

test('known answerability defect remains a regression but is excluded from gold metrics until teacher review', () => {
  const results = cases.map(runMebEvalCase)
  const summary = summarizeMebEvalResults(results)

  expect(results.every(result => result.passed)).toBe(true)
  expect(summary.pendingTeacherReviewCount).toBe(1)
  expect(summary.approvedBenchmarkCount).toBe(0)
  expect(summary.benchmarkPassRate).toBeNull()
  expect(summary.regressionFailureCount).toBe(0)
})

test('benchmark approval requires teacher identity, evidence and a versioned official objective', () => {
  const incompleteApproval: MebEvalCase = {
    ...cases[0],
    kind: 'benchmark',
    reviewStatus: 'approved',
    curriculum: null,
    review: { reviewerId: '', reviewedAt: '', evidenceRef: '' },
  }
  expect(validateMebEvalCase(incompleteApproval)).toContain('TEACHER_REVIEW_EVIDENCE_REQUIRED')
  expect(validateMebEvalCase(incompleteApproval)).toContain('VERIFIED_OBJECTIVE_AND_VERSION_REQUIRED')
})
