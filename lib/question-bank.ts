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
  'adaptiveHint', 'adaptiveSupportLevel', 'adaptivePresentation', 'adaptiveFocus',
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

function hasVisual(question: Question): boolean {
  if (question.hasVisual === true) return true
  if (typeof question.svg === 'string' && question.svg.includes('<svg')) return true
  if (question.qtype === 'svg' || question.type === 'table_fill') return true
  const text = questionBankKey(question.q)
  return /grafik|tablo|sekil|diyagram|koordinat|harita|sema|zaman cizelgesi/.test(text)
}

function isNewGenerationTopic(topic: string): boolean {
  const key = questionBankKey(topic)
  return /yeni nesil|beceri temelli|yorum gerektiren|gercek yasam|gunluk hayat/.test(key)
}

function selectWithVisualQuota(rows: any[], count: number, topic: string): any[] {
  const ratio = isNewGenerationTopic(topic) ? 0.5 : 0.3
  const target = Math.min(count, Math.max(1, Math.ceil(count * ratio)))
  const visualRows = shuffled(rows.filter(row => hasVisual(row.question))).slice(0, target)
  const chosen = new Set(visualRows.map(row => row.id))
  const remaining = shuffled(rows.filter(row => !chosen.has(row.id))).slice(0, count - visualRows.length)
  return shuffled([...visualRows, ...remaining])
}

export function balanceAnswerPositions(questions: Question[]): Question[] {
  const targets = new Map<number, number>()
  for (const optionCount of [4, 5]) {
    const eligibleIndexes = questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => Array.isArray(question.opts)
        && question.opts.length === optionCount
        && Number.isInteger(question.ans)
        && question.ans >= 0
        && question.ans < optionCount)
      .map(({ index }) => index)

    // Each complete group contains one answer at every position. Remainders
    // and order are randomized, so the sequence is not predictable.
    const targetPositions = shuffled(eligibleIndexes.map((_, index) => index % optionCount))
    eligibleIndexes.forEach((questionIndex, index) => targets.set(questionIndex, targetPositions[index]))
  }

  return questions.map((question, questionIndex) => {
    const target = targets.get(questionIndex)
    if (target === undefined) return { ...question }

    const correctOption = question.opts[question.ans]
    const distractors = shuffled(question.opts.filter((_: unknown, index: number) => index !== question.ans))
    const opts: unknown[] = []
    let distractorIndex = 0
    for (let optionIndex = 0; optionIndex < question.opts.length; optionIndex++) {
      opts.push(optionIndex === target ? correctOption : distractors[distractorIndex++])
    }
    return { ...question, opts, ans: target }
  })
}

function validQuestion(question: Question): boolean {
  if (!question || typeof question.q !== 'string' || !question.q.trim()) return false
  if (question.sourceBased || question.passage) return false
  if (question.type === 'short_answer') {
    const referenceAnswer = question.blank || question.referenceAnswer || question.opts?.[question.ans]
    const explanation = question.exp || question.explanation
    return typeof referenceAnswer === 'string' && referenceAnswer.trim().length > 0
      && typeof explanation === 'string' && explanation.trim().length > 0
  }
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
  const query = (includeSubject: boolean) => {
    let request = db.from('question_bank').select('id, question, fingerprint, use_count')
      .eq('topic_key', questionBankKey(dimensions.topic))
      .eq('grade_key', questionBankKey(dimensions.grade))
      .eq('language_key', questionBankKey(dimensions.language))
      .eq('question_type', dimensions.questionType)
      .eq('difficulty', dimensions.difficulty)
      .eq('review_status', 'approved').eq('report_count', 0)
      .order('use_count', { ascending: true })
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .limit(Math.max(count * 5, 30))
    if (includeSubject) request = request.eq('subject_key', questionBankKey(dimensions.subject || 'genel'))
    return request
  }
  let { data, error } = await query(true)
  // Eski oturumların önemli bir bölümünde ders alanı "Genel" olarak
  // kaydedildi. Konu+sınıf+dil+tip+zorluk zaten yeterince dar bir anahtardır;
  // tam ders eşleşmesi kapasiteyi doldurmazsa yalnızca bu ekseni gevşet.
  if (!error && (data?.length || 0) < count) {
    const fallback = await query(false)
    if (!fallback.error && Array.isArray(fallback.data)) {
      const unique = new Map([...(data || []), ...fallback.data].map((row: any) => [row.id, row]))
      data = [...unique.values()]
    }
  }

  if (error || !Array.isArray(data)) return []
  const candidates = data
    .filter((row: any) => !excluded.has(questionBankKey(row.question?.q)))
    .slice(0, Math.min(data.length, count * 2))
  // Havuzda görsel soru varsa her testte yaklaşık %30 oranında seç. Görsel
  // kapasite yetersizse kalan yerler normal sorularla doldurulur.
  const selected = selectWithVisualQuota(candidates, count, dimensions.topic)

  const { error: usageError } = await db.rpc('mark_question_bank_used', {
    p_ids: selected.map((row: any) => row.id),
  })
  if (usageError) console.warn(`[question-bank] usage update skipped code=${usageError.code || 'unknown'}`)

  return balanceAnswerPositions(selected.map((row: any) => ({
    ...row.question,
    bankQuestionId: row.id,
    bankFingerprint: row.fingerprint,
  })))
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
      const visual = hasVisual(clean)
      // Görsel soru ile ilişkili SVG aynı question JSON'unda tutulur. Ayrı
      // bir dosya/URL'ye bağımlı olmadığı için havuzdan tekrar sunulduğunda
      // soru ve görsel birlikte gelir.
      const bankQuestion = {
        ...clean,
        hasVisual: visual,
        visualKind: visual ? (clean.qtype === 'svg' || clean.svg ? 'svg' : 'structured') : null,
      }
      return {
        fingerprint: questionFingerprint(bankQuestion),
        subject_key: questionBankKey(dimensions.subject || 'genel'),
        topic_key: questionBankKey(dimensions.topic),
        grade_key: questionBankKey(dimensions.grade),
        language_key: questionBankKey(dimensions.language),
        question_type: dimensions.questionType,
        difficulty: dimensions.difficulty,
        question: bankQuestion,
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
