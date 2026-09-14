/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, randomInt } from 'node:crypto'

type AnyDb = any
type Question = Record<string, any>

export type QuestionBankDimensions = {
  subject?: string | null
  topic: string
  grade: string
  language: string
  questionType: string
  difficulty: string
}

const PERSONAL_FIELDS = new Set([
  'adaptivePolicyVersion', 'adaptiveReasonCode', 'adaptiveRecommendationId',
  'adaptiveHint', 'adaptiveSupportLevel', 'adaptivePresentation',
  'diagnosticStrategyVersion', 'diagnosticReasonCode', 'diagnosticRole',
  'masteryConfidenceBefore', 'masteryEvidenceCountBefore', 'passage',
])

export function questionBankKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü]+/gi, ' ')
    .trim()
}

export function questionFingerprint(question: Question): string {
  const text = [question.q, ...(Array.isArray(question.opts) ? question.opts : [])]
    .map(questionBankKey)
    .join('|')
  return createHash('sha256').update(text).digest('hex')
}

function reusableQuestion(question: Question): Question {
  return Object.fromEntries(
    Object.entries(question).filter(([key]) => !PERSONAL_FIELDS.has(key))
  )
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index--) {
    const swapWith = randomInt(index + 1)
    ;[result[index], result[swapWith]] = [result[swapWith], result[index]]
  }
  return result
}

function randomizedForDelivery(question: Question): Question {
  const result = { ...question }
  if (Array.isArray(question.opts) && Number.isInteger(question.ans)) {
    const indexed = question.opts.map((option: unknown, index: number) => ({ option, index }))
    const randomized = shuffled(indexed)
    result.opts = randomized.map(item => item.option)
    result.ans = randomized.findIndex(item => item.index === question.ans)
  }
  return result
}

function validQuestion(question: Question): boolean {
  if (!question || typeof question.q !== 'string' || !question.q.trim()) return false
  if (question.sourceBased || question.passage) return false
  if (question.type === 'multiple_choice' || Array.isArray(question.opts)) {
    return Array.isArray(question.opts)
      && question.opts.length >= 2
      && Number.isInteger(question.ans)
      && question.ans >= 0
      && question.ans < question.opts.length
  }
  return true
}

export async function getQuestionBankSet(
  db: AnyDb,
  dimensions: QuestionBankDimensions,
  count: number,
  excludedTexts: string[] = [],
): Promise<Question[]> {
  if (count <= 0) return []
  const excluded = new Set(excludedTexts.map(questionBankKey).filter(Boolean))
  const { data, error } = await db
    .from('question_bank')
    .select('id, question, fingerprint, use_count')
    .eq('subject_key', questionBankKey(dimensions.subject || 'genel'))
    .eq('topic_key', questionBankKey(dimensions.topic))
    .eq('grade_key', questionBankKey(dimensions.grade))
    .eq('language_key', questionBankKey(dimensions.language))
    .eq('question_type', dimensions.questionType)
    .eq('difficulty', dimensions.difficulty)
    .eq('review_status', 'approved')
    .eq('report_count', 0)
    .order('use_count', { ascending: true })
    .order('last_used_at', { ascending: true, nullsFirst: true })
    .limit(Math.max(count * 5, 30))

  if (error || !Array.isArray(data)) return []
  const candidates = data
    .filter((row: any) => !excluded.has(questionBankKey(row.question?.q)))
    .slice(0, Math.min(data.length, count * 2))
  const selected = shuffled(candidates).slice(0, count)

  // Do not serve a partial cache result: the caller either avoids the AI
  // call completely or follows the existing generation path unchanged.
  if (selected.length < count) return []

  const { error: usageError } = await db.rpc('mark_question_bank_used', {
    p_ids: selected.map((row: any) => row.id),
  })
  if (usageError) console.warn(`[question-bank] usage update skipped code=${usageError.code || 'unknown'}`)

  return selected.map((row: any) => ({
    ...randomizedForDelivery(row.question),
    bankQuestionId: row.id,
    bankFingerprint: row.fingerprint,
  }))
}

export async function promoteQuestionsToBank(
  db: AnyDb,
  dimensions: QuestionBankDimensions,
  questions: Question[],
  source: { sessionId?: string; engine?: string },
): Promise<number> {
  const rows = questions
    .filter(validQuestion)
    .map(question => {
      const clean = reusableQuestion(question)
      return {
        fingerprint: questionFingerprint(clean),
        subject_key: questionBankKey(dimensions.subject || 'genel'),
        topic_key: questionBankKey(dimensions.topic),
        grade_key: questionBankKey(dimensions.grade),
        language_key: questionBankKey(dimensions.language),
        question_type: dimensions.questionType,
        difficulty: dimensions.difficulty,
        question: clean,
        review_status: 'approved',
        quality_score: 1,
        source_session_id: source.sessionId || null,
        source_engine: source.engine || null,
        updated_at: new Date().toISOString(),
      }
    })

  if (!rows.length) return 0
  const { error } = await db.from('question_bank').upsert(rows, {
    onConflict: 'fingerprint',
    ignoreDuplicates: true,
  })
  if (error) {
    console.warn(`[question-bank] promotion skipped code=${error.code || 'unknown'}`)
    return 0
  }
  return rows.length
}
