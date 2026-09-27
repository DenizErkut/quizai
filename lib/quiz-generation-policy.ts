export const REQUIRED_DIFFICULTIES = ['kolay', 'normal', 'zor', 'cok zor'] as const
export type RequiredDifficulty = typeof REQUIRED_DIFFICULTIES[number]

export const QUIZ_QUESTION_TYPES = [
  'multiple_choice', 'fill_blank', 'matching', 'true_false', 'ordering',
  'short_answer', 'multi_true_false', 'table_fill', 'mixed',
] as const
export type QuizQuestionType = typeof QUIZ_QUESTION_TYPES[number]

export function normalizeRequestedQuestionType(value: unknown): QuizQuestionType {
  return typeof value === 'string' && (QUIZ_QUESTION_TYPES as readonly string[]).includes(value)
    ? value as QuizQuestionType
    : 'mixed'
}

/**
 * Karma dışındaki bir seçim, üreticinin etiketiyle değil öğrencinin açık
 * tercihiyle belirlenir. Yanlış formatta dönen adaylar doğrulama/havuz/yedek
 * akışlarına girmeden elenir. Karma ise gerçek soru tiplerinin tümünü kabul
 * eder; `mixed` yalnız istek tipidir, tekil bir soru tipi değildir.
 */
export function questionMatchesRequestedType(question: Record<string, unknown>, requested: unknown): boolean {
  const expected = normalizeRequestedQuestionType(requested)
  const actual = typeof question.type === 'string' ? question.type : ''
  if (expected === 'mixed') {
    return actual !== 'mixed' && (QUIZ_QUESTION_TYPES as readonly string[]).includes(actual)
  }
  return actual === expected
}

export function filterQuestionsByRequestedType<T extends Record<string, unknown>>(questions: T[], requested: unknown): T[] {
  return questions.filter(question => questionMatchesRequestedType(question, requested))
}

export interface DifficultyQuota {
  kolay: number
  normal: number
  zor: number
  'cok zor': number
}

export type QuestionGenerationProvider = 'openai' | 'mistral' | 'anthropic'
export type QuestionGenerationDifficulty = 'kolay' | 'normal' | 'zor' | 'cok zor'
export interface QuestionGenerationBatch {
  provider: QuestionGenerationProvider
  difficulty: QuestionGenerationDifficulty
  count: number
}

/** Largest-remainder apportionment for the requested 50/20/20/10 difficulty split. */
export function buildQuestionGenerationPlan(count: number): QuestionGenerationBatch[] {
  const size = Math.max(0, Math.trunc(count))
  if (!size) return []
  const roles: Array<{ provider: QuestionGenerationProvider; difficulty: QuestionGenerationDifficulty; weight: number }> = [
    { provider: 'openai', difficulty: 'kolay', weight: 0.50 },
    { provider: 'mistral', difficulty: 'normal', weight: 0.20 },
    { provider: 'anthropic', difficulty: 'zor', weight: 0.20 },
    { provider: 'anthropic', difficulty: 'cok zor', weight: 0.10 },
  ]
  const raw = roles.map(role => role.weight * size)
  const counts = raw.map(Math.floor)
  let remaining = size - counts.reduce((sum, value) => sum + value, 0)
  const order = raw.map((value, index) => ({ index, remainder: value - counts[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (let index = 0; index < remaining; index++) counts[order[index].index]++

  // For 3+ questions, ensure every assigned role appears at least once.
  // Take from OpenAI's largest share; percentages are approximate for small sets.
  if (size >= roles.length) {
    for (let index = 1; index < roles.length; index++) {
      if (counts[index] === 0) {
        const donor = counts[0] > 1 ? 0 : counts.findIndex((value, candidate) => candidate !== index && value > 1)
        if (donor >= 0) { counts[donor]--; counts[index]++ }
      }
    }
  }
  return roles.flatMap((role, index) => counts[index] > 0
    ? [{ provider: role.provider, difficulty: role.difficulty, count: counts[index] }]
    : [])
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

export function normalizeDifficultyLevel(value: unknown): RequiredDifficulty | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLocaleLowerCase('tr-TR').replace(/çok/g, 'cok').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (normalized === 'kolay' || normalized === 'normal' || normalized === 'zor' || normalized === 'cok zor') return normalized
  if (['very hard', 'very difficult', 'advanced'].includes(normalized)) return 'cok zor'
  if (['hard', 'difficult'].includes(normalized)) return 'zor'
  if (['easy', 'beginner', 'basic'].includes(normalized)) return 'kolay'
  if (['orta', 'orta seviye', 'medium', 'intermediate', 'average'].includes(normalized)) return 'normal'
  return null
}

export function buildAdaptiveDifficultyQuota(count: number, startingDifficulty: string): DifficultyQuota {
  const size = Math.max(0, Math.trunc(count))
  if (!size) return { kolay: 0, normal: 0, zor: 0, 'cok zor': 0 }
  const weights = startingDifficulty === 'kolay'
    ? [0.55, 0.25, 0.15, 0.05]
    : ['zor', 'cok zor', 'çok zor'].includes(startingDifficulty.toLocaleLowerCase('tr-TR'))
      ? [0.30, 0.20, 0.30, 0.20]
      : [0.50, 0.20, 0.20, 0.10]
  const values = [...REQUIRED_DIFFICULTIES]
  const quota: DifficultyQuota = { kolay: 0, normal: 0, zor: 0, 'cok zor': 0 }
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
  const actual: DifficultyQuota = { kolay: 0, normal: 0, zor: 0, 'cok zor': 0 }
  for (const question of questions) {
    const level = normalizeDifficultyLevel(question.difficulty)
    if (!level) return false
    actual[level]++
  }
  // This is a target distribution, not an all-or-nothing inventory gate.
  // A 30% drift band keeps the requested mix meaningful while allowing a
  // quality-rejected item to disappear without taking the whole test down.
  const tolerance = Math.max(1, Math.ceil(questions.length * 0.3))
  return REQUIRED_DIFFICULTIES.every(level => Math.abs(actual[level] - quota[level]) <= tolerance)
}

export function requiredVisualCount(count: number, ratio = 0.3): number {
  return Math.ceil(Math.max(0, count) * ratio)
}

/**
 * Convert the 70% quality target into a usable integer threshold.
 *
 * `ceil` made a two-question starter batch require 2/2 accepted questions,
 * turning the configured 70% target into a hidden 100% gate. Rounding keeps
 * the closest whole-question target (2 -> 1, 3 -> 2, 10 -> 7), while still
 * requiring at least one independently verified question.
 */
export function minimumVerifiedQuestionCount(count: number, ratio = 0.7): number {
  const size = Math.max(0, Math.trunc(count))
  if (!size) return 0
  return Math.max(1, Math.round(size * ratio))
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
    && Number(quality?.score) >= 70
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
