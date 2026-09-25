import type { Question } from '@/lib/quiz-constants'
import type { QualitySignal } from '@/lib/ai-gateway/quality-engine'

/**
 * Deterministic checks for known answerability failures that can slip through
 * structural validation and model review. Keep checks narrow and evidence-based.
 */
export function evaluateQuestionConsistency(question: Question): QualitySignal {
  const text = `${question.q || ''} ${Array.isArray(question.opts) ? question.opts.join(' ') : ''}`
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, character => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[character] || character)

  const asksForMinimumCubes = /(?:en az|minim|minimum|en kucuk).{0,90}(?:kup|birim kup|blok)|(?:kup|birim kup|blok).{0,90}(?:en az|minim|minimum|en kucuk)/i.test(text)
  const referencesOrthographicViews = /on gorunus|ust gorunus|yan gorunus/.test(text)
  const hasExplicitViewLayout = (view: string) => new RegExp(
    `${view} gorunus.{0,100}(?:\\[[01](?:\\s*[,|/]\\s*[01]){2,}\\]|koordinat.{0,30}\\(?-?\\d+\\s*,\\s*-?\\d+\\)?|(?:satir|hucre).{0,20}[01]\\s*[01])`,
    'i',
  ).test(text)
  const includesExplicitProjectionLayout = ['on', 'ust', 'yan'].every(hasExplicitViewLayout)

  // Scalar totals for the three orthographic views do not specify which cells
  // are occupied or how the projections overlap. Therefore they cannot support
  // a unique minimum-cube answer unless the actual silhouettes/layout are given.
  if (asksForMinimumCubes && referencesOrthographicViews && !includesExplicitProjectionLayout) {
    return {
      source: 'deterministic-answerability',
      verdict: 'reject',
      reasonCode: 'PROJECTION_LAYOUT_MISSING',
      detail: 'Ön/üst/yan görünüşlerin gerçek siluet/yerleşim verisi soruda yok; yalnız adlarını veya kare sayılarını vermek en az küp sayısını belirlemeye yetmez.',
    }
  }

  return { source: 'deterministic-answerability', verdict: 'accept', reasonCode: 'ANSWERABILITY_RULES_PASSED' }
}
