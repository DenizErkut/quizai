import { answerScore } from './partial-scoring'
import { hasVerifiedObjectiveMapping, hasVerifiedBankQuality } from './objective-mapping-verification'

export const MIN_MEASUREMENT_ITEMS = 5
export const MIN_MEASUREMENT_GAP_MS = 24 * 60 * 60 * 1000
export const MAX_MEASUREMENT_GAP_MS = 90 * MIN_MEASUREMENT_GAP_MS

type Question = {
  q?: unknown
  opts?: unknown
  ans?: unknown
  difficulty?: unknown
  learningObjectiveId?: unknown
  objectiveMappingStatus?: unknown
  objectiveVerified?: unknown
  qualityVerificationVersion?: unknown
  historicalBankQuality?: unknown
}

type Answer = { correct?: boolean; awardedScore?: unknown; hintUsed?: unknown }

export type MeasurementSession = {
  id: string
  user_id: string
  completed: boolean
  question_count: number
  questions: unknown
  answers: unknown
}

export type SessionEvidence = {
  objectiveId: string
  scorePct: number
  itemCount: number
  signatures: string[]
  difficultyProfile: string[]
}

export function inspectMeasurementSession(session: MeasurementSession):
  { evidence: SessionEvidence; reason: null } | { evidence: null; reason: string } {
  if (!session.completed) return { evidence: null, reason: 'Test tamamlanmamış.' }
  const questions = Array.isArray(session.questions) ? session.questions as Question[] : []
  const answers = Array.isArray(session.answers) ? session.answers as Answer[] : []
  if (questions.length < MIN_MEASUREMENT_ITEMS || answers.length !== questions.length || session.question_count !== questions.length) {
    return { evidence: null, reason: `Ölçüm için en az ${MIN_MEASUREMENT_ITEMS} yanıtlanmış soru gerekli.` }
  }
  if (answers.some(answer => answer.hintUsed === true)) return { evidence: null, reason: 'Ölçüm testinde ipucu kullanılmış.' }
  const ids = new Set<string>()
  const signatures: string[] = []
  const difficultyProfile: string[] = []
  for (const question of questions) {
    const objectiveId = typeof question.learningObjectiveId === 'string' ? question.learningObjectiveId : ''
    const mappingVerified = hasVerifiedObjectiveMapping(question as Record<string, unknown>)
    const historicalReview = question.historicalBankQuality as { status?: unknown; score?: unknown; policyVersion?: unknown } | undefined
    const qualityVerified = hasVerifiedBankQuality(question as Record<string, unknown>) ||
      (question.objectiveMappingStatus === 'human_approved' &&
        ['added', 'already_in_bank'].includes(String(historicalReview?.status)) &&
        historicalReview?.policyVersion === 'historical-bank-quality-v1' && Number(historicalReview.score) >= 80)
    if (!mappingVerified || question.objectiveVerified !== true || !qualityVerified || !objectiveId) {
      return { evidence: null, reason: 'Soruların kazanım veya kalite doğrulama kanıtı eksik.' }
    }
    ids.add(objectiveId)
    const signature = typeof question.q === 'string' ? question.q.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim() : ''
    if (!signature) return { evidence: null, reason: 'Soru metni eksik.' }
    signatures.push(signature)
    difficultyProfile.push(typeof question.difficulty === 'string' ? question.difficulty.toLocaleLowerCase('tr-TR').trim() : '')
  }
  if (ids.size !== 1) return { evidence: null, reason: 'Test birden fazla kazanımı ölçüyor.' }
  if (new Set(signatures).size !== signatures.length) return { evidence: null, reason: 'Test içinde yinelenen soru var.' }
  if (difficultyProfile.some(value => !value)) return { evidence: null, reason: 'Soru zorluk kanıtı eksik.' }
  const total = answers.reduce((sum, answer) => sum + answerScore(answer), 0)
  return { evidence: {
    objectiveId: [...ids][0],
    scorePct: Math.round(total / questions.length * 10000) / 100,
    itemCount: questions.length,
    signatures,
    difficultyProfile: difficultyProfile.sort(),
  }, reason: null }
}

export function inspectMeasurementPair(pre: SessionEvidence, post: SessionEvidence, preAt: string, postAt: string): string | null {
  if (pre.objectiveId !== post.objectiveId) return 'Ön ve son test farklı kazanımları ölçüyor.'
  if (pre.itemCount !== post.itemCount || pre.difficultyProfile.join('|') !== post.difficultyProfile.join('|')) {
    return 'Testlerin soru sayısı veya zorluk dağılımı eşit değil.'
  }
  if (pre.signatures.some(signature => post.signatures.includes(signature))) return 'Ön ve son testte aynı soru kullanılmış.'
  const gap = Date.parse(postAt) - Date.parse(preAt)
  if (!Number.isFinite(gap) || gap < MIN_MEASUREMENT_GAP_MS || gap > MAX_MEASUREMENT_GAP_MS) {
    return 'Ölçümler 1–90 gün arayla tamamlanmış olmalı.'
  }
  return null
}
