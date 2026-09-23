export type CognitiveRigorLevel = 'temel' | 'uygulama' | 'muhakeme'

export type QuestionRigorAssessment = {
  score: number
  level: CognitiveRigorLevel
  signals: string[]
  issues: string[]
}

export type QuestionSetRigorSummary = {
  version: 'question-rigor-v1'
  averageScore: number
  minimumScore: number
  basicCount: number
  applicationCount: number
  reasoningCount: number
  visualCount: number
  directRecallCount: number
  meetsTarget: boolean
  targetApplicationCount: number
  targetReasoningCount: number
}

type QuestionLike = Record<string, unknown> & {
  q?: unknown
  opts?: unknown
  exp?: unknown
  explanation?: unknown
  type?: unknown
  svg?: unknown
  chartData?: unknown
  qtype?: unknown
}

function normalize(value: unknown): string {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü\s%+\-*/=<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function wordCount(value: unknown): number {
  const text = normalize(value)
  return text ? text.split(' ').length : 0
}

function hasValidOptions(question: QuestionLike): boolean {
  if (!Array.isArray(question?.opts) || question.opts.length < 4) return false
  const normalized = question.opts.map((option: unknown) => normalize(option)).filter(Boolean)
  return normalized.length >= 4 && new Set(normalized).size === normalized.length
}

/**
 * Deterministic, provider-independent structural rigor check. This does not
 * claim to solve a question; it measures the observable traits that separate
 * direct recall from application and multi-step reasoning. The result is
 * persisted with each question so production quality can be measured later.
 */
export function assessQuestionRigor(question: QuestionLike): QuestionRigorAssessment {
  const text = normalize(question?.q)
  const explanation = normalize(question?.exp || question?.explanation)
  const words = wordCount(text)
  const signals: string[] = []
  const issues: string[] = []
  let score = 20

  const hasContext = /bir öğrenci|bir araştırma|bir deney|bir okul|bir sınıf|bir mağaza|bir çiftlik|günlük yaşam|durum|senaryo|verilen bilgi|aşağıdaki veri|tablo|grafik|şema|harita|koordinat|zaman çizelgesi/.test(text)
  const hasReasoning = /neden|sonuç|çıkarılabilir|ulaşılabilir|karşılaştır|hata|yanılgı|değişirse|olursa|buna göre|hangileri|kanıt|yorum|gerekçe|ilişki/.test(text)
  const hasVisualData = Boolean(question?.svg || question?.chartData || question?.qtype === 'svg') || /tablo|grafik|şema|harita|koordinat|diyagram|şekil/.test(text)
  const numericFacts = text.match(/-?\d+(?:[.,]\d+)?/g)?.length || 0
  const directRecall = /^(aşağıdakilerden hangisi\s+)?[^?]{0,70}(nedir|tanımıdır|adı nedir|hangisidir)\??$/.test(text)
    || /aşağıdakilerden hangisi .{0,45} değildir\??$/.test(text)
  const directCalculation = words <= 13 && /kaçtır|sonucu nedir|değeri nedir/.test(text) && numericFacts <= 2

  if (words >= 18) { score += 8; signals.push('yeterli-soru-kökü') }
  if (hasContext) { score += 18; signals.push('bağlam-uygulama') }
  if (hasReasoning) { score += 20; signals.push('çıkarım-karşılaştırma') }
  if (hasVisualData) { score += 14; signals.push('veri-görsel-yorumlama') }
  if (numericFacts >= 3) { score += 8; signals.push('çoklu-veri') }
  if (wordCount(explanation) >= 12) { score += 7; signals.push('gerekçeli-açıklama') }
  if (question?.type !== 'multiple_choice' || hasValidOptions(question)) { score += 5; signals.push('geçerli-seçenek-yapısı') }

  if (directRecall) { score -= 25; issues.push('doğrudan-ezber') }
  if (directCalculation) { score -= 20; issues.push('tek-adımlı-işlem') }
  if (words < 9) { score -= 10; issues.push('çok-kısa-soru-kökü') }
  if (question?.type === 'multiple_choice' && !hasValidOptions(question)) { score -= 12; issues.push('zayıf-seçenek-yapısı') }
  if (wordCount(explanation) < 7) { score -= 7; issues.push('yetersiz-açıklama') }

  score = Math.max(0, Math.min(100, score))
  const level: CognitiveRigorLevel = score >= 68 ? 'muhakeme' : score >= 45 ? 'uygulama' : 'temel'
  return { score, level, signals, issues }
}

export function summarizeQuestionSetRigor(questions: QuestionLike[], difficulty: string): QuestionSetRigorSummary {
  const assessments = questions.map(assessQuestionRigor)
  const count = Math.max(1, assessments.length)
  const level = normalize(difficulty)
  const hard = /zor|hard|ileri|advanced/.test(level)
  const easy = /kolay|easy|temel|basic/.test(level)
  const targetApplicationCount = Math.ceil(count * (hard ? 0.9 : easy ? 0.6 : 0.8))
  const targetReasoningCount = Math.ceil(count * (hard ? 0.7 : easy ? 0.3 : 0.5))
  const applicationCount = assessments.filter(item => item.level !== 'temel').length
  const reasoningCount = assessments.filter(item => item.level === 'muhakeme').length

  return {
    version: 'question-rigor-v1',
    averageScore: Math.round(assessments.reduce((sum, item) => sum + item.score, 0) / count),
    minimumScore: assessments.length ? Math.min(...assessments.map(item => item.score)) : 0,
    basicCount: assessments.filter(item => item.level === 'temel').length,
    applicationCount,
    reasoningCount,
    visualCount: questions.filter(question => question?.svg || question?.chartData || question?.qtype === 'svg').length,
    directRecallCount: assessments.filter(item => item.issues.includes('doğrudan-ezber') || item.issues.includes('tek-adımlı-işlem')).length,
    meetsTarget: applicationCount >= targetApplicationCount && reasoningCount >= targetReasoningCount,
    targetApplicationCount,
    targetReasoningCount,
  }
}

export function attachQuestionRigorMetadata<T extends QuestionLike>(questions: T[]): Array<T & {
  qualityRigorVersion: 'question-rigor-v1'
  qualityRigorScore: number
  qualityCognitiveLevel: CognitiveRigorLevel
  qualitySignals: string[]
  qualityIssues: string[]
}> {
  return questions.map(question => {
    const assessment = assessQuestionRigor(question)
    return {
      ...question,
      qualityRigorVersion: 'question-rigor-v1',
      qualityRigorScore: assessment.score,
      qualityCognitiveLevel: assessment.level,
      qualitySignals: assessment.signals,
      qualityIssues: assessment.issues,
    }
  })
}
