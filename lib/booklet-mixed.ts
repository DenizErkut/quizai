// Mixed booklets ("Karışık"): one PDF covers every subject of a grade. The
// subject and unit of each question come from the verified catalog objective it
// is linked to — never from the upload form — so the pool lookup (subject +
// topic + grade) finds them under their real subject.
import { questionBankKey } from './question-bank'

export type CatalogObjective = { objective_code: string; title: string; subject: string; topic: string | null; unit: string | null }

const MIXED_KEYS = new Set(['karisik', 'karma', 'tum dersler', 'tum dersler karisik', 'butun dersler', 'hepsi', 'tumu'])

export function isMixedSubject(subject: unknown): boolean {
  const key = questionBankKey(String(subject || '').replace(/\(.*\)/, '')).replace(/ı/g, 'i')
  return MIXED_KEYS.has(key)
}

/** One compact line per objective; long titles (English outcomes run 250+ chars) are cut so a grade fits in one prompt. */
export function mixedObjectiveReferences(objectives: CatalogObjective[], maxTitle = 110): string {
  return objectives.map(o => `${o.objective_code} | ${o.subject} | ${o.title.replace(/\s+/g, ' ').slice(0, maxTitle)}`).join('\n')
}

export type BookletDifficulty = 'kolay' | 'normal' | 'zor' | 'cok zor'
export function bookletDifficulty(value: unknown): BookletDifficulty {
  const key = questionBankKey(String(value || '')).replace(/ı/g, 'i')
  if (['easy', 'kolay'].includes(key)) return 'kolay'
  if (['very hard', 'cok zor', 'very difficult'].includes(key)) return 'cok zor'
  if (['hard', 'zor', 'difficult'].includes(key)) return 'zor'
  return 'normal'
}

type Extracted = { q?: unknown; opts?: unknown; ans?: unknown; exp?: unknown; type?: unknown }

/** Multiple choice (4-5 options) or a short answer (one reference answer of at most one sentence). */
export function validBookletQuestion(q: Extracted): boolean {
  if (typeof q.q !== 'string' || !q.q.trim() || typeof q.exp !== 'string' || !q.exp.trim() || !Array.isArray(q.opts)) return false
  if (q.type === 'short_answer') {
    const answer = q.opts.length === 1 && typeof q.opts[0] === 'string' ? q.opts[0].trim() : ''
    return answer.length > 0 && answer.length <= 160 && (answer.match(/[.!?](\s|$)/g) || []).length <= 1 && q.ans === 0
  }
  return q.opts.length >= 4 && q.opts.length <= 5 && Number.isInteger(q.ans) && Number(q.ans) >= 0 && Number(q.ans) < q.opts.length
}

export type MixedPlacement = { subject: string; topic: string; objectiveCode: string | null; verified: boolean }

/** A question is placed only through a catalog objective; otherwise it stays unplaced and goes to review. */
export function placeMixedQuestion(code: unknown, byCode: Map<string, CatalogObjective>, fallbackSubject?: unknown, fallbackTopic?: unknown): MixedPlacement {
  const objective = typeof code === 'string' ? byCode.get(code.trim().toLocaleUpperCase('tr-TR')) : undefined
  if (objective) return { subject: objective.subject, topic: objective.topic || objective.unit || '', objectiveCode: objective.objective_code, verified: true }
  return { subject: typeof fallbackSubject === 'string' ? fallbackSubject : '', topic: typeof fallbackTopic === 'string' ? fallbackTopic : '', objectiveCode: null, verified: false }
}
