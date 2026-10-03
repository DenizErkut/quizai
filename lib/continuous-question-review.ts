export const CONTINUOUS_REVIEW_POLICY = 'continuous-objective-review-v1'
export type QuestionReview = { ok?: boolean; score?: number; reason?: string; difficultyMatches?: boolean; objectiveMatches?: boolean; answerCorrect?: boolean; explanationConsistent?: boolean; ageAppropriate?: boolean; unambiguous?: boolean } | null
type Objective = { id: string; objectiveCode: string; revisionId: string; curriculumVersionId: string; grade: string; subject: string }
type Question = Record<string, any>

/** Option permutation is presentation, not a new question. All other assessed content is bound. */
export function continuousReviewContent(q: Question): string {
  const correct = Array.isArray(q.opts) && Number.isInteger(q.ans) ? q.opts[q.ans] : q.ans
  const normalizeExplanation = (value: unknown) => typeof value === 'string' ? value
    .replace(/Doğru\s+cevap\s+[A-E][\)\.]?\s*(?:seçeneğidir|şıkkıdır|şıkkı)?\.?/giu, `Doğru cevap: ${String(correct)}.`)
    .replace(/(?:Cevap|Yanıt)\s*[:：]?\s*[A-E][\)\.]\b/giu, `Cevap: ${String(correct)}.`) : value
  const fields = ['q','type','blank','referenceAnswer','pairs','items','correctOrder','statements','tableData','tableAnswers','difficulty','svg','chartData','passage']
  return JSON.stringify({ ...Object.fromEntries(fields.filter(key => q[key] !== undefined && q[key] !== null && q[key] !== '').map(key => [key,q[key]])),
    opts: Array.isArray(q.opts) ? [...q.opts].sort() : q.opts, answer: correct,
    exp: normalizeExplanation(q.exp), explanation: normalizeExplanation(q.explanation) })
}

export function needsVisualTeacherReview(q: Question): boolean {
  return Boolean(q.svg || q.chartData || q.hasVisual || q.type === 'table_fill')
}

export function createContinuousReview(q: Question, objective: Objective | null, checks: Array<{ provider: string; model: string; result: QuestionReview }>) {
  const audits = checks.map(({ provider,model,result }) => ({ ...result,provider,model }))
  const complete = checks.length === 2 && new Set(checks.map(check => check.provider)).size === 2
    && checks.every(({ result }) => result?.ok === true && typeof result.score === 'number' && Number.isFinite(result.score)
      && result.score >= 80 && result.score <= 100 && result.difficultyMatches === true && result.objectiveMatches === true
      && result.answerCorrect === true && result.explanationConsistent === true && result.ageAppropriate === true && result.unambiguous === true)
  const reason = !objective ? 'missing_objective' : needsVisualTeacherReview(q) ? 'visual_review_required'
    : checks.some(check => !check.result) ? 'review_unavailable'
    : !complete ? 'auditor_disagreement_or_incomplete_evidence' : 'two_independent_auditors_agreed'
  return { policyVersion: CONTINUOUS_REVIEW_POLICY, decision: complete && objective && !needsVisualTeacherReview(q) ? 'approved' : 'teacher_review',
    reason, reviewedAt: new Date().toISOString(), content: continuousReviewContent(q), objectiveId: objective?.id,
    objectiveCode: objective?.objectiveCode, revisionId: objective?.revisionId, curriculumVersionId: objective?.curriculumVersionId,
    grade: objective?.grade, subject: objective?.subject, score: Math.min(...checks.map(check => Number.isFinite(check.result?.score) ? Number(check.result?.score) : 0)), audits }
}

export function hasContinuousApproval(q: Question): boolean {
  const r = q.objectiveProductionReview
  if (!r || r.policyVersion !== CONTINUOUS_REVIEW_POLICY || r.decision !== 'approved' || needsVisualTeacherReview(q)
    || r.content !== continuousReviewContent(q) || r.objectiveId !== q.learningObjectiveId || r.objectiveCode !== q.learningObjectiveCode
    || !r.revisionId || r.revisionId !== q.learningObjectiveRevisionId || r.curriculumVersionId !== q.curriculumVersionId) return false
  return Array.isArray(r.audits) && r.audits.length === 2 && new Set(r.audits.map((a: any) => a.provider)).size === 2
    && r.audits.every((a: any) => ['openai','mistral','anthropic','google'].includes(a.provider) && a.ok === true && Number.isFinite(a.score)
      && a.score >= 80 && a.score <= 100 && a.difficultyMatches === true && a.objectiveMatches === true
      && a.answerCorrect === true && a.explanationConsistent === true && a.ageAppropriate === true && a.unambiguous === true)
}

export function finalizeContinuousReview(q: Question): Question {
  const reuse = q.objectiveReuseEvidence
  if (reuse && (reuse.content !== continuousReviewContent(q) || reuse.objectiveId !== q.learningObjectiveId
    || reuse.revisionId !== q.learningObjectiveRevisionId || reuse.curriculumVersionId !== q.curriculumVersionId)) {
    return { ...q,objectiveMappingStatus:'review_required',objectiveVerified:false,objectiveReviewException:'content_changed_after_review' }
  }
  if (!q.objectiveProductionReview) return q
  if (hasContinuousApproval(q)) return { ...q,objectiveMappingStatus:'ai_approved',objectiveVerified:true,
    qualityVerificationVersion:CONTINUOUS_REVIEW_POLICY,difficultyVerified:true,objectiveReviewException:null }
  const reason = needsVisualTeacherReview(q) ? 'visual_review_required'
    : q.objectiveProductionReview.content !== continuousReviewContent(q) ? 'content_changed_after_review'
    : q.objectiveProductionReview.decision === 'approved' ? 'objective_changed_after_review' : q.objectiveProductionReview.reason
  return { ...q,objectiveMappingStatus:'review_required',objectiveReviewException:reason }
}
