export const HISTORICAL_OBJECTIVE_REVIEW_POLICY = 'historical-objective-backfill-v1'

type Audit = { provider?: unknown; approved?: unknown; objectiveCode?: unknown; score?: unknown; difficultyMatches?: unknown; answerCorrect?: unknown; explanationConsistent?: unknown; ageAppropriate?: unknown; unambiguous?: unknown; directObjectiveMatch?: unknown; standalone?: unknown }

export function objectiveReviewContent(question: Record<string, unknown>): string {
  const keys = ['q', 'opts', 'ans', 'exp', 'explanation', 'type', 'blank', 'referenceAnswer', 'pairs', 'items', 'correctOrder', 'statements', 'tableData', 'tableAnswers']
  return JSON.stringify(Object.fromEntries(keys.filter(key => question[key] !== undefined).map(key => [key, question[key]])))
}

/** Automated decisions carry their own provenance and require two agreeing auditors. */
export function hasAutomatedObjectiveApproval(question: Record<string, unknown>): boolean {
  const review = question.objectiveBackfillReview as { policyVersion?: unknown; decision?: unknown; audits?: Audit[]; content?: unknown; sourceContext?: unknown } | undefined
  const audits = review?.audits
  return question.objectiveMappingStatus === 'ai_approved'
    && question.objectiveVerified === true
    && typeof question.learningObjectiveId === 'string' && Boolean(question.learningObjectiveId)
    && typeof question.learningObjectiveCode === 'string' && Boolean(question.learningObjectiveCode)
    && review?.policyVersion === HISTORICAL_OBJECTIVE_REVIEW_POLICY && review.decision === 'approved'
    && review.content === objectiveReviewContent(question)
    && Array.isArray(audits) && audits.length === 2
    && new Set(audits.map(audit => audit.provider)).size === 2
    && (audits.every(audit => audit.standalone === true) || review.sourceContext === undefined
      || JSON.stringify(review.sourceContext) === JSON.stringify(question.passage))
    && audits.every(audit => ['openai', 'mistral'].includes(String(audit.provider)) && audit.approved === true
      && audit.objectiveCode === question.learningObjectiveCode && typeof audit.score === 'number' && audit.score >= 80
      && audit.answerCorrect === true && audit.explanationConsistent === true && audit.ageAppropriate === true
      && audit.unambiguous === true && audit.directObjectiveMatch === true)
}

export function hasVerifiedObjectiveMapping(question: Record<string, unknown>): boolean {
  return ['mapped', 'human_approved'].includes(String(question.objectiveMappingStatus)) || hasAutomatedObjectiveApproval(question)
}

/** Reusable stock may use audited backfill questions; this does not certify past learning gain. */
export function hasVerifiedBankQuality(question: Record<string, unknown>): boolean {
  if (question.qualityVerificationVersion === 'quiz-quality-v2') return true
  const review = question.objectiveBackfillReview as { audits?: Audit[]; reviewedDifficulty?: unknown } | undefined
  return question.qualityVerificationVersion === HISTORICAL_OBJECTIVE_REVIEW_POLICY
    && hasAutomatedObjectiveApproval(question)
    && review.reviewedDifficulty === question.difficulty
    && review?.audits?.every(audit => audit.difficultyMatches === true) === true
}
