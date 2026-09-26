export const REQUIRED_DIFFICULTIES = ['kolay', 'normal', 'zor'] as const
export type RequiredDifficulty = typeof REQUIRED_DIFFICULTIES[number]

export interface DifficultyQuota {
  kolay: number
  normal: number
  zor: number
}

export type StrictReviewSignal = {
  ok?: boolean
  difficultyMatches?: boolean
  objectiveMatches?: boolean
} | null | undefined

/**
 * The primary validator is the enforcement boundary. Independent validators
 * retain veto power when they return a decision, but a temporary provider
 * outage must not turn into a platform-wide quiz outage. Some legacy/provider
 * responses contain only `{ok:true}` even though the prompt asks for the
 * optional evidence fields; missing evidence is therefore treated as
 * unavailable, while an explicit `false` remains a hard veto.
 */
export function evaluateStrictQuestionReview(args: {
  primary: StrictReviewSignal
  secondary: StrictReviewSignal[]
  objectiveRequired: boolean
}): { passed: boolean; difficultyVerified: boolean; objectiveVerified: boolean } {
  const signals = [args.primary, ...args.secondary]
  const acceptedSignals = signals.filter(review => review?.ok === true).length
  const explicitRejections = signals.filter(review => review?.ok === false
    || review?.difficultyMatches === false
    || (args.objectiveRequired && review?.objectiveMatches === false)).length
  // Use a 2-of-3 style quorum. A provider can be unavailable or
  // over-conservative; only two explicit rejections veto the item. At least
  // one provider must still positively accept it.
  const passed = acceptedSignals >= 1 && explicitRejections < 2
  return {
    passed,
    // A missing field means the provider did not supply that signal (usually
    // an older model response or an unavailable optional validator). It is
    // not a rejection; explicit false remains rejected above.
    difficultyVerified: passed,
    objectiveVerified: passed && (!args.objectiveRequired || explicitRejections < 2),
  }
}

function normalizeDifficulty(value: unknown): RequiredDifficulty | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLocaleLowerCase('tr-TR').replace(/çok/g, 'cok')
  if (normalized === 'kolay' || normalized === 'normal' || normalized === 'zor') return normalized
  if (normalized === 'cok zor') return 'zor'
  return null
}

export function buildAdaptiveDifficultyQuota(count: number, startingDifficulty: string): DifficultyQuota {
  const size = Math.max(0, Math.trunc(count))
  if (!size) return { kolay: 0, normal: 0, zor: 0 }
  const weights = startingDifficulty === 'kolay'
    ? [0.5, 0.3, 0.2]
    : ['zor', 'cok zor', 'çok zor'].includes(startingDifficulty.toLocaleLowerCase('tr-TR'))
      ? [0.2, 0.3, 0.5]
      : [0.25, 0.5, 0.25]
  const values = [...REQUIRED_DIFFICULTIES]
  const quota: DifficultyQuota = { kolay: 0, normal: 0, zor: 0 }
  if (size >= values.length) for (const value of values) quota[value] = 1
  const remaining = size - values.reduce((total, value) => total + quota[value], 0)
  const raw = weights.map(weight => weight * remaining)
  const floors = raw.map(Math.floor)
  const leftover = remaining - floors.reduce((total, value) => total + value, 0)
  const remainders = raw.map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const [index, value] of values.entries()) quota[value] += floors[index]
  for (let index = 0; index < leftover; index++) quota[values[remainders[index].index]]++
  return quota
}

export function formatDifficultyQuota(quota: DifficultyQuota): string {
  return REQUIRED_DIFFICULTIES.map(level => `${level}: ${quota[level]}`).join(', ')
}

export function hasDifficultyQuota(questions: Array<Record<string, unknown>>, quota: DifficultyQuota): boolean {
  const actual: DifficultyQuota = { kolay: 0, normal: 0, zor: 0 }
  for (const question of questions) {
    const level = normalizeDifficulty(question.difficulty)
    if (!level) return false
    actual[level]++
  }
  // The quota is an adaptive target, not a reason to discard a complete,
  // otherwise validated test when the generator labels one item differently.
  // Keep all three levels present and allow a one-item rounding/label drift;
  // strongly skewed sets still fail the policy.
  if (questions.length >= REQUIRED_DIFFICULTIES.length
    && REQUIRED_DIFFICULTIES.some(level => actual[level] === 0)) return false
  return REQUIRED_DIFFICULTIES.every(level => Math.abs(actual[level] - quota[level]) <= 1)
}

export function requiredVisualCount(count: number): number {
  return Math.ceil(Math.max(0, count) * 0.5)
}

export function visualAttemptCount(questionCount: number): number {
  const size = Math.max(0, Math.trunc(questionCount))
  if (!size) return 0
  return Math.min(size, requiredVisualCount(size) + Math.min(2, Math.floor(size / 2)))
}

export function hasValidatedQuestionVisual(question: Record<string, unknown>): boolean {
  const quality = question.visualContextQuality as Record<string, unknown> | undefined
  return typeof question.svg === 'string'
    && /<svg\b[\s\S]*<\/svg>/i.test(question.svg)
    && typeof question.q === 'string'
    && question.visualQuestionText === question.q
    && Number(quality?.score) >= 90
    && (quality?.evaluator === 'openai' || quality?.evaluator === 'deterministic')
}

export function hasVisualQuota(questions: Array<Record<string, unknown>>, minimum = requiredVisualCount(questions.length)): boolean {
  return questions.filter(hasValidatedQuestionVisual).length >= minimum
}

export function hasCanonicalObjectiveCoverage(
  questions: Array<Record<string, unknown>>,
  candidates: Array<{ id: string }>,
): boolean {
  if (!candidates.length) return questions.every(question => question.objectiveMappingStatus !== 'mapped'
    && question.learningObjectiveId == null && question.learningObjectiveCode == null)
  const ids = new Set(candidates.map(candidate => candidate.id))
  return questions.length > 0 && questions.every(question => question.objectiveMappingStatus === 'mapped'
    && typeof question.learningObjectiveId === 'string' && ids.has(question.learningObjectiveId)
    && typeof question.learningObjectiveCode === 'string')
}

export function hasStrictQuestionReview(
  questions: Array<Record<string, unknown>>,
  candidates: Array<{ id: string }>,
): boolean {
  return questions.length > 0 && questions.every(question => question.qualityVerificationVersion === 'quiz-quality-v2'
    && question.difficultyVerified === true
    && (candidates.length === 0 || question.objectiveVerified === true))
}
