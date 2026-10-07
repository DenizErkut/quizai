/* eslint-disable @typescript-eslint/no-explicit-any */
import { phantomVisualIssue } from './phantom-visual'
import { createHash, randomInt } from 'node:crypto'
import { hasAutomatedObjectiveApproval } from './objective-mapping-verification'
import { hasContinuousApproval, CONTINUOUS_REVIEW_POLICY } from './continuous-question-review'
import { bankVisualTarget } from './visual-quota-policy'

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

export function questionBankTypeFilter(value: unknown): string | null {
  const key = questionBankKey(value)
  return key === 'mixed' || key === 'karisik' || key === 'karısık' || key === 'karışık' ? null : String(value || '')
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

// 23 Eylül 2026 — Deniz'in bulduğu hata: bu fonksiyon eskiden son satırda
// soru METNİNDE "harita/tablo/grafik/..." kelimesi geçiyor mu diye bakıp
// GERÇEK bir görsel varlığı (svg/chartData) olmasa bile "hasVisual: true"
// döndürebiliyordu. Sonuç: promoteQuestionsToBank bu soruları havuza
// "görsel" diye etiketleyerek yazıyordu, selectWithVisualQuota da bunları
// görsel kotasını doldurmak için seçiyordu — ama öğrenciye giden soruda
// hiçbir zaman gerçek bir resim/SVG/grafik olmuyordu (üretim anında görsel
// üretimi başarısız olmuş ya da hiç denenmemiş olabilirdi, buna rağmen metin
// eşleşmesi yüzünden "görsel" sayılıyordu). Production havuzunda bu, "harita
// bilgisi" konusundaki 10 sorunun 10'unun da (ve havuz genelinde "hasVisual"
// işaretli 51 sorudan 50'sinin) hiçbir gerçek svg/chartData taşımadığı
// anlamına geliyordu. Artık SADECE gerçek bir varlık (eşleşen svg, geçerli
// chartData veya kendiliğinden görsel olan table_fill tipi) "görsel" sayılır;
// anahtar kelime eşleşmesi tek başına asla yeterli değildir.
export function hasRealVisualAsset(question: Question): boolean {
  if (typeof question.svg === 'string' && question.svg.includes('<svg')) {
    return question.visualQuestionText === question.q
  }
  if (question.chartData && typeof question.chartData === 'object') return true
  if (question.type === 'table_fill') return true
  return false
}

function isNewGenerationTopic(topic: string): boolean {
  const key = questionBankKey(topic)
  return /yeni nesil|beceri temelli|yorum gerektiren|gercek yasam|gunluk hayat/.test(key)
}

function selectWithVisualQuota(rows: any[], count: number, topic: string, subject?: string | null): any[] {
  // Numeric subjects: 30% (50% for "yeni nesil"); verbal subjects: about 10%, possibly none (see visual-quota-policy).
  const target = bankVisualTarget(subject, count, isNewGenerationTopic(topic))
  const exactRows = shuffled(rows.filter(row => ['teacher_exact', 'ai_exact'].includes(row.question?.sourcePolicy))).slice(0, count)
  const chosen = new Set(exactRows.map(row => row.id))
  const exactVisualCount = exactRows.filter(row => hasRealVisualAsset(row.question)).length
  const visualRows = shuffled(rows.filter(row => !chosen.has(row.id) && hasRealVisualAsset(row.question)))
    .slice(0, Math.max(0, target - exactVisualCount))
  visualRows.forEach(row => chosen.add(row.id))
  const remaining = shuffled(rows.filter(row => !chosen.has(row.id))).slice(0, count - exactRows.length - visualRows.length)
  return shuffled([...exactRows, ...visualRows, ...remaining])
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
    if (hasAutomatedObjectiveApproval(question) || question.objectiveMappingStatus === 'human_approved') return { ...question }
    const target = targets.get(questionIndex)
    if (target === undefined) return { ...question }

    const misconceptions = Array.isArray(question.distractorMisconceptions)
      && question.distractorMisconceptions.length === question.opts.length
      ? question.distractorMisconceptions
      : null
    const correctOption = question.opts[question.ans]
    const distractors: Array<{ option: unknown; misconception: unknown; index: number }> = shuffled((question.opts as unknown[])
      .map((option: unknown, index: number) => ({ option, misconception: misconceptions?.[index] ?? null, index }))
      .filter((entry: { index: number }) => entry.index !== question.ans))
    const opts: unknown[] = []
    const reorderedMisconceptions: unknown[] = []
    let distractorIndex = 0
    for (let optionIndex = 0; optionIndex < question.opts.length; optionIndex++) {
      if (optionIndex === target) {
        opts.push(correctOption)
        reorderedMisconceptions.push(null)
      } else {
        const distractor = distractors[distractorIndex++]
        opts.push(distractor.option)
        reorderedMisconceptions.push(distractor.misconception)
      }
    }
    return normalizeAnswerReference({
      ...question,
      opts,
      ans: target,
      ...(misconceptions ? { distractorMisconceptions: reorderedMisconceptions } : {}),
    })
  })
}

function normalizeAnswerReference(question: Question): Question {
  if (!Array.isArray(question.opts) || !Number.isInteger(question.ans)) return question
  const correct = String(question.opts[question.ans] ?? '').trim()
  if (!correct) return question
  const explanationKey = typeof question.exp === 'string'
    ? 'exp'
    : typeof question.explanation === 'string' ? 'explanation' : null
  if (!explanationKey) return question
  const explanation = String(question[explanationKey])
    .replace(/Doğru\s+cevap\s+[A-E][\)\.]?\s*(?:seçeneğidir|şıkkıdır|şıkkı)?\.?/giu, `Doğru cevap: ${correct}.`)
    .replace(/(?:Cevap|Yanıt)\s*[:：]?\s*[A-E][\)\.]\b/giu, `Cevap: ${correct}.`)
  return { ...question, [explanationKey]: explanation }
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
  const query = (includeSubject: boolean, exactDifficulty = true) => {
    let request = db.from('question_bank').select('id, question, fingerprint, use_count, subject_key, topic_key')
      .eq('topic_key', questionBankKey(dimensions.topic))
      .eq('grade_key', questionBankKey(dimensions.grade))
      .eq('language_key', questionBankKey(dimensions.language))
      .eq('review_status', 'approved').eq('report_count', 0)
      .order('use_count', { ascending: true })
      .order('last_used_at', { ascending: true, nullsFirst: true })
      .limit(Math.max(count * 5, 30))
    if (exactDifficulty) request = request.eq('difficulty', dimensions.difficulty)
    if (includeSubject) request = request.eq('subject_key', questionBankKey(dimensions.subject || 'genel'))
    const typeFilter = questionBankTypeFilter(dimensions.questionType)
    if (typeFilter) request = request.eq('question_type', typeFilter)
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

  // Pool first: a test mixes four difficulty levels, but rows carry one level
  // each, so an exact-difficulty match left topics with dozens of approved rows
  // (e.g. 67, 46, 21) at 'miss'. Rows of the requested difficulty stay first;
  // other difficulties only fill what is still short, and the AI covers the rest.
  if (!error && (data?.length || 0) < count) {
    const widened = await query(true, false)
    const widenedAny = (widened.error || (widened.data?.length || 0) === 0) ? await query(false, false) : widened
    if (!widenedAny.error && Array.isArray(widenedAny.data)) {
      const unique = new Map([...(data || []), ...widenedAny.data].map((row: any) => [row.id, row]))
      data = [...unique.values()]
    }
  }

  // Öğretmen imzalı ve ayrıca hazırlanmış AI kitapçığı soruları onaylandıktan
  // sonra öğrenciye birebir gösterilebilir. Eski kayıtların anahtarları bugünkü
  // normalizasyondan önce yazılmış olabileceği için yalnızca tam difficulty
  // filtresine bağlı kalma; aynı sınıf/dil/tip içindeki exact soruları
  // getirip konu ve ders eşleşmesini uygulama tarafında yeniden doğrula.
  const exactRows = await db.from('question_bank')
    .select('id, question, fingerprint, use_count, subject_key, topic_key')
    .eq('grade_key', questionBankKey(dimensions.grade))
    .eq('review_status', 'approved')
    .eq('report_count', 0)
    .order('use_count', { ascending: true })
    .limit(250)
  if (!exactRows.error && Array.isArray(exactRows.data)) {
    const requestedSubject = questionBankKey(dimensions.subject || 'genel')
    const requestedTopic = questionBankKey(dimensions.topic)
    const matchingExactRows = exactRows.data.filter((row: any) => {
      if (!['teacher_exact', 'ai_exact'].includes(row.question?.sourcePolicy)) return false
      const rowSubject = questionBankKey(row.subject_key || row.question?.subject || 'genel')
      const rowTopics = [row.question?.bookletTopic, row.question?.objective, row.topic_key]
        .map(questionBankKey)
        .filter(Boolean)
      const subjectMatches = rowSubject === requestedSubject
        || rowSubject === 'genel'
        || requestedSubject.includes(rowSubject)
        || rowSubject.includes(requestedSubject)
      const topicMatches = rowTopics.some((rowTopic: string) => rowTopic === requestedTopic
        || rowTopic.includes(requestedTopic)
        || requestedTopic.includes(rowTopic))
      const requestedType = questionBankKey(dimensions.questionType)
      const typeMatches = requestedType === 'mixed'
        || requestedType === 'karisik'
        || requestedType === 'multiple choice'
      return subjectMatches && topicMatches && typeMatches
    })
    const unique = new Map([...(matchingExactRows || []), ...(data || [])].map((row: any) => [row.id, row]))
    data = [...unique.values()]
  }

  if (error || !Array.isArray(data)) return []
  const candidates = data
    .filter((row: any) => !excluded.has(questionBankKey(row.question?.q)))
    .filter((row: any) => !phantomVisualIssue(row.question || {}))
    .slice(0, Math.min(data.length, count * 2))
  // Havuzda görsel soru varsa her testte yaklaşık %30 oranında seç. Görsel
  // kapasite yetersizse kalan yerler normal sorularla doldurulur.
  const selected = selectWithVisualQuota(candidates, count, dimensions.topic, dimensions.subject)

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

// source.engine'deki kaba etiketten (örn. 'claude-sonnet', 'gpt-4.1-mini',
// 'mistral-large') sağlayıcıyı çıkarır — provenance için. Bilinmeyen/boş
// etiketlerde null döner, hiçbir şey uydurulmaz.
function providerFromEngine(engine: string | undefined): string | null {
  const key = String(engine || '').toLocaleLowerCase('tr-TR')
  if (key.startsWith('claude')) return 'anthropic'
  if (key.startsWith('gpt')) return 'openai'
  if (key.startsWith('mistral')) return 'mistral'
  if (key.startsWith('gemini')) return 'google'
  return null
}

// 23 Eylül 2026 — Pratium uyum raporu (Tema 3, agent kimlik/izin ayrımı):
// bu fonksiyon AI-üretimi soruları artık DOĞRUDAN 'approved' yazmıyor.
// learning-graph-suggest'teki "AI asla canlıya kendi başına yazmaz"
// deseninin bir benzeri: yeni sorular 'candidate' + awaiting_expert_review
// = false olarak yazılır; supabase/migrations/20260923090000_question_bank_
// shadow_review.sql'deki RPC, hiç rapor almadan gölge süresini (varsayılan
// 48 saat) dolduran satırları otomatik 'approved'a yükseltir. Bir öğrenci
// raporu (report-question) veya öğretmen düzeltmesi (question-bank-review)
// bu satırı awaiting_expert_review=true ile candidate'e düşürürse, artık
// SADECE bir insan approved/rejected kararı verebilir.
export async function promoteQuestionsToBank(
  db: AnyDb,
  dimensions: QuestionBankDimensions,
  questions: Question[],
  source: { sessionId?: string; engine?: string; teacherExceptions?: boolean },
): Promise<number> {
  const rows = questions
    .filter(question => source.teacherExceptions ? typeof question.q === 'string' && Boolean(question.q.trim()) : validQuestion(question))
    .map(question => {
      const clean = reusableQuestion(question)
      const automaticApproval = !source.teacherExceptions && hasContinuousApproval(clean)
      const requiresTeacher = source.teacherExceptions === true || question.objectiveMappingStatus === 'review_required'
      const visual = hasRealVisualAsset(clean)
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
        question_type: typeof question.type === 'string' ? question.type : dimensions.questionType,
        difficulty: typeof question.difficulty === 'string' ? question.difficulty : dimensions.difficulty,
        question: bankQuestion,
        review_status: automaticApproval ? 'approved' : 'candidate',
        awaiting_expert_review: requiresTeacher,
        ai_provider: providerFromEngine(source.engine),
        ai_model: source.engine || null,
        ai_policy_version: automaticApproval ? CONTINUOUS_REVIEW_POLICY : 'question-bank-shadow-review-v1',
        quality_score: automaticApproval ? Number(question.objectiveProductionReview.score) / 100 : requiresTeacher ? 0 : 1,
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
