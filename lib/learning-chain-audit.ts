// Read-only audit of the verified learning chain for each teacher-assigned cycle:
// baseline → guided practice → post → teacher review (pair) → transfer → teacher review (transfer).
// The delayed single-item checks (learning_transfer_checks) are a separate pipeline and are
// reported next to the chain, not as one of its links.

export type ChainCycle = { id: string; student_id: string; learning_objective_id: string; status: string; created_at: string }
export type ChainAttempt = { cycle_id: string; stage: 'baseline' | 'post' | 'transfer'; status: string; completed_at: string | null; score_pct: number | null; quiz_session_id: string | null }
export type ChainGuided = { cycle_id: string; status: string; completed_at: string | null }
export type ChainReview = { pre_session_id: string; post_session_id: string; transfer_session_id: string | null; reviewed_at: string | null; transfer_reviewed_by: string | null; transfer_reviewed_at: string | null }
export type ChainDelayedCheck = { student_id: string; learning_objective_id: string; status: string }

export const CHAIN_LINKS = ['baseline', 'guided_practice', 'post', 'teacher_review_pair', 'transfer', 'teacher_review_transfer'] as const
export type ChainLink = typeof CHAIN_LINKS[number]

export const LINK_LABEL: Record<ChainLink, string> = {
  baseline: 'Ön test', guided_practice: 'Rehberli çalışma', post: 'Son test',
  teacher_review_pair: 'Öğretmen incelemesi (ön/son)', transfer: 'Aktarım testi', teacher_review_transfer: 'Öğretmen incelemesi (aktarım)',
}

// learning-gain-v1: a pre/post pair must be 1–90 days apart.
const MIN_PRE_POST_DAYS = 1
const MAX_PRE_POST_DAYS = 90
const DAY = 86_400_000
const days = (from: string | null, to: string | null) => from && to ? Math.round(((Date.parse(to) - Date.parse(from)) / DAY) * 100) / 100 : null

export type Warning = 'pre_post_gap_out_of_range' | 'out_of_order' | 'cycle_completed_with_missing_links'

export function auditChains(input: { cycles: ChainCycle[]; attempts: ChainAttempt[]; guided: ChainGuided[]; reviews: ChainReview[]; delayed: ChainDelayedCheck[] }) {
  const done = (a?: { status: string; completed_at: string | null }) => a?.status === 'completed' && a.completed_at ? a.completed_at : null
  const rows = input.cycles.map(cycle => {
    const attempt = (stage: ChainAttempt['stage']) => input.attempts.find(a => a.cycle_id === cycle.id && a.stage === stage)
    const baseline = attempt('baseline'), post = attempt('post'), transfer = attempt('transfer')
    const guided = input.guided.find(g => g.cycle_id === cycle.id)
    const pair = baseline?.quiz_session_id && post?.quiz_session_id
      ? input.reviews.find(r => r.pre_session_id === baseline.quiz_session_id && r.post_session_id === post.quiz_session_id) : undefined
    const transferReview = transfer?.quiz_session_id
      ? input.reviews.find(r => r.transfer_session_id === transfer.quiz_session_id && r.transfer_reviewed_by && r.transfer_reviewed_at) : undefined
    const at: Record<ChainLink, string | null> = {
      baseline: done(baseline), guided_practice: done(guided), post: done(post),
      teacher_review_pair: pair?.reviewed_at ?? null, transfer: done(transfer), teacher_review_transfer: transferReview?.transfer_reviewed_at ?? null,
    }
    const links = CHAIN_LINKS.map(key => ({ key, label: LINK_LABEL[key], state: at[key] ? 'done' as const : 'missing' as const, at: at[key] }))
    const firstMissing = links.find(l => l.state === 'missing')?.key ?? null
    const prePostDays = days(at.baseline, at.post)
    const warnings: Warning[] = []
    if (prePostDays !== null && (prePostDays < MIN_PRE_POST_DAYS || prePostDays > MAX_PRE_POST_DAYS)) warnings.push('pre_post_gap_out_of_range')
    const ordered = [at.baseline, at.guided_practice, at.post, at.transfer].filter((v): v is string => v !== null)
    if (ordered.some((value, i) => i > 0 && Date.parse(value) < Date.parse(ordered[i - 1]))) warnings.push('out_of_order')
    if (cycle.status === 'completed' && firstMissing) warnings.push('cycle_completed_with_missing_links')
    const delayed = input.delayed.filter(d => d.student_id === cycle.student_id && d.learning_objective_id === cycle.learning_objective_id)
    return {
      cycleId: cycle.id, studentId: cycle.student_id, objectiveId: cycle.learning_objective_id, status: cycle.status, createdAt: cycle.created_at,
      links, complete: firstMissing === null, firstMissing, warnings,
      scores: { baseline: baseline?.score_pct ?? null, post: post?.score_pct ?? null, transfer: transfer?.score_pct ?? null },
      gapsDays: { baselineToPost: prePostDays, postToTransfer: days(at.post, at.transfer) },
      delayedChecks: { total: delayed.length, completed: delayed.filter(d => d.status === 'completed').length },
    }
  })
  const count = (key: ChainLink) => rows.filter(r => r.links.find(l => l.key === key)?.state === 'done').length
  return {
    totals: {
      cycles: rows.length, completeChains: rows.filter(r => r.complete).length,
      students: new Set(rows.map(r => r.studentId)).size, objectives: new Set(rows.map(r => r.objectiveId)).size,
      byLink: Object.fromEntries(CHAIN_LINKS.map(key => [key, count(key)])) as Record<ChainLink, number>,
      withWarnings: rows.filter(r => r.warnings.length).length,
    },
    rows,
  }
}
