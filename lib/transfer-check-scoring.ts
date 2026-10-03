import { hasVerifiedObjectiveMapping, hasVerifiedBankQuality } from './objective-mapping-verification'

type TransferQuestion = Record<string, unknown>

export function usableTransferQuestion(question: TransferQuestion, objectiveId: string, sourceText: string, sourceDifficulty?: string): boolean {
  const options = question.opts
  const answer = question.ans
  const text = typeof question.q === 'string' ? question.q.trim() : ''
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
  return Boolean(text && normalize(text) !== normalize(sourceText))
    && Array.isArray(options) && options.length >= 3 && options.every(option => typeof option === 'string' && option.trim())
    && Number.isInteger(answer) && Number(answer) >= 0 && Number(answer) < options.length
    && question.learningObjectiveId === objectiveId
    && hasVerifiedObjectiveMapping(question)
    && question.objectiveVerified === true
    && hasVerifiedBankQuality(question)
    && (!sourceDifficulty || String(question.difficulty || '').trim().toLocaleLowerCase('tr-TR') === sourceDifficulty.trim().toLocaleLowerCase('tr-TR'))
}

export function gradeTransferChoice(answerIndex: unknown, correctIndex: number): 'independent_success' | 'not_transferred' | 'unanswered' {
  if (!Number.isInteger(answerIndex) || Number(answerIndex) < 0) return 'unanswered'
  return answerIndex === correctIndex ? 'independent_success' : 'not_transferred'
}
