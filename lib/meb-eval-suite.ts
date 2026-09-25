import type { Question } from '@/lib/quiz-constants'
import { evaluateQuestionConsistency } from '@/lib/question-consistency'

export type MebEvalReviewStatus = 'pending_teacher_review' | 'approved' | 'rejected'

export interface MebEvalCase {
  id: string
  kind: 'safety-regression' | 'benchmark'
  reviewStatus: MebEvalReviewStatus
  sourceRef: string
  curriculum: { objectiveCode: string; sourceReference: string; version: string } | null
  question: Question
  expected: { consistencyVerdict: 'accept' | 'reject'; reasonCode?: string }
  review?: { reviewerId: string; reviewedAt: string; evidenceRef: string }
}

export interface MebEvalCaseResult {
  id: string
  reviewStatus: MebEvalReviewStatus
  countedInBenchmark: boolean
  passed: boolean
  actualVerdict: string
  actualReasonCode: string
}

/** Teacher sign-off is mandatory before a case contributes to benchmark metrics. */
export function runMebEvalCase(testCase: MebEvalCase): MebEvalCaseResult {
  const signal = evaluateQuestionConsistency(testCase.question)
  const passed = signal.verdict === testCase.expected.consistencyVerdict
    && (!testCase.expected.reasonCode || signal.reasonCode === testCase.expected.reasonCode)
  const hasTeacherApproval = testCase.reviewStatus === 'approved'
    && Boolean(testCase.review?.reviewerId && testCase.review?.reviewedAt && testCase.review?.evidenceRef)

  return {
    id: testCase.id,
    reviewStatus: testCase.reviewStatus,
    countedInBenchmark: testCase.kind === 'benchmark' && hasTeacherApproval,
    passed,
    actualVerdict: signal.verdict,
    actualReasonCode: signal.reasonCode,
  }
}

export function summarizeMebEvalResults(results: MebEvalCaseResult[]) {
  const benchmarkResults = results.filter(result => result.countedInBenchmark)
  return {
    caseCount: results.length,
    approvedBenchmarkCount: benchmarkResults.length,
    pendingTeacherReviewCount: results.filter(result => result.reviewStatus === 'pending_teacher_review').length,
    rejectedCaseCount: results.filter(result => result.reviewStatus === 'rejected').length,
    benchmarkPassRate: benchmarkResults.length
      ? benchmarkResults.filter(result => result.passed).length / benchmarkResults.length
      : null,
    regressionFailureCount: results.filter(result => !result.passed).length,
  }
}

export function validateMebEvalCase(testCase: MebEvalCase): string[] {
  const errors: string[] = []
  if (!testCase.id.trim()) errors.push('CASE_ID_REQUIRED')
  if (!testCase.sourceRef.trim()) errors.push('SOURCE_REFERENCE_REQUIRED')
  if (testCase.kind === 'benchmark' && !testCase.curriculum) errors.push('CURRICULUM_REFERENCE_REQUIRED')
  if (testCase.kind === 'benchmark' && testCase.reviewStatus === 'approved') {
    if (!testCase.review?.reviewerId || !testCase.review.reviewedAt || !testCase.review.evidenceRef) {
      errors.push('TEACHER_REVIEW_EVIDENCE_REQUIRED')
    }
    if (!testCase.curriculum?.objectiveCode || !testCase.curriculum.sourceReference || !testCase.curriculum.version) {
      errors.push('VERIFIED_OBJECTIVE_AND_VERSION_REQUIRED')
    }
  }
  return errors
}
