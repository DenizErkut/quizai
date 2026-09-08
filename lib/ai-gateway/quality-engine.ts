import type { Question } from '@/lib/quiz-constants'

export type QualityVerdict = 'accept' | 'reject' | 'unavailable'

export interface QualitySignal {
  source: string
  verdict: QualityVerdict
  reasonCode: string
  detail?: string
}

export interface QualityDecision {
  policyVersion: 'quality-engine-v1'
  verdict: 'accept' | 'reject'
  reasonCode: string
  signals: QualitySignal[]
}

export function evaluateQuestionStructure(question: Question): QualitySignal {
  const fail = (reasonCode: string): QualitySignal => ({ source: 'deterministic-schema', verdict: 'reject', reasonCode })
  if (!question || typeof question.q !== 'string' || !question.q.trim()) return fail('QUESTION_TEXT_MISSING')
  const type = question.type || 'multiple_choice'

  if (type === 'multiple_choice') {
    if (!Array.isArray(question.opts) || question.opts.length < 2) return fail('OPTIONS_MISSING')
    if (!Number.isInteger(question.ans) || question.ans < 0 || question.ans >= question.opts.length) return fail('ANSWER_INDEX_INVALID')
  }
  if (type === 'true_false' && question.ans !== 0 && question.ans !== 1) return fail('TRUE_FALSE_ANSWER_INVALID')
  if (type === 'fill_blank' && !question.blank && !question.opts?.[question.ans]) return fail('FILL_ANSWER_MISSING')
  if (type === 'short_answer' && !question.opts?.[question.ans] && !question.blank) return fail('REFERENCE_ANSWER_MISSING')
  if (type === 'matching' && (!Array.isArray(question.pairs) || question.pairs.length < 2 || question.pairs.some(pair => !pair?.left || !pair?.right))) return fail('MATCHING_PAIRS_INVALID')
  if (type === 'multi_true_false' && (!Array.isArray(question.statements) || question.statements.length < 2 || question.statements.some(statement => typeof statement?.correct !== 'boolean' || !statement?.text))) return fail('STATEMENTS_INVALID')
  if (type === 'ordering') {
    const items = question.items || []
    const order = question.correctOrder || []
    const validPermutation = items.length >= 2 && order.length === items.length && new Set(order).size === items.length && order.every(index => Number.isInteger(index) && index >= 0 && index < items.length)
    if (!validPermutation) return fail('ORDERING_SHAPE_INVALID')
  }
  if (type === 'table_fill' && (!question.tableData?.rows?.length || !question.tableAnswers?.length)) return fail('TABLE_FILL_SHAPE_INVALID')

  return { source: 'deterministic-schema', verdict: 'accept', reasonCode: 'STRUCTURE_VALID' }
}

export function decideQuestionQuality(signals: QualitySignal[]): QualityDecision {
  const rejection = signals.find(signal => signal.verdict === 'reject')
  if (rejection) return { policyVersion: 'quality-engine-v1', verdict: 'reject', reasonCode: rejection.reasonCode, signals }
  return {
    policyVersion: 'quality-engine-v1',
    verdict: 'accept',
    reasonCode: signals.some(signal => signal.verdict === 'accept') ? 'ALL_AVAILABLE_CHECKS_PASSED' : 'NO_CHECK_AVAILABLE_FAIL_OPEN',
    signals,
  }
}

export function providerQualitySignal(source: string, result: { ok: boolean; reason?: string } | null | undefined): QualitySignal {
  if (!result) return { source, verdict: 'unavailable', reasonCode: 'PROVIDER_UNAVAILABLE' }
  return result.ok
    ? { source, verdict: 'accept', reasonCode: 'PROVIDER_ACCEPTED' }
    : { source, verdict: 'reject', reasonCode: 'PROVIDER_REJECTED', detail: result.reason?.slice(0, 240) }
}
