import type { verifiedLearningMetrics } from './verified-learning-metrics'

export const TEACHER_ACTION_LINK_POLICY = 'teacher-evidence-action-link-v1'
export const ACTION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export type ActionProposal = {
  id: string; teacher_id?: string; student_id: string; classroom_id: string | null;
  agent_name: string; policy_version: string; proposed_action: string;
  title: string; rationale: string; evidence: Record<string, unknown>;
  status: string; created_at: string; reviewed_at: string | null; review_note: string | null;
}
export type ActionCycle = {
  id: string; teacher_id: string; student_id: string; classroom_id: string;
  learning_objective_id: string; created_at: string; status: string;
}
export type ActionFollowup = {
  cycleId: string; status: 'assigned' | 'started' | 'measured' | 'reviewed';
  metrics: ReturnType<typeof verifiedLearningMetrics>;
}
export function proposalObjectiveId(proposal: Pick<ActionProposal, 'evidence'>): string | null {
  const id = proposal.evidence?.objectiveId ?? proposal.evidence?.learningObjectiveId ?? proposal.evidence?.objective_id
  return typeof id === 'string' && ACTION_UUID.test(id) ? id : null
}
/** Similar topics or pre-existing cycles are not evidence that a teacher decision was applied. */
export function canLinkActionCycle(proposal: ActionProposal, cycle: ActionCycle, teacherId: string): boolean {
  const reviewed = Date.parse(proposal.reviewed_at || ''), created = Date.parse(cycle.created_at)
  return proposal.status === 'approved' && ['assign_practice', 'adjust_plan'].includes(proposal.proposed_action)
    && proposal.teacher_id === teacherId && cycle.teacher_id === teacherId
    && Boolean(proposal.classroom_id) && cycle.classroom_id === proposal.classroom_id
    && cycle.student_id === proposal.student_id && cycle.learning_objective_id === proposalObjectiveId(proposal)
    && Number.isFinite(reviewed) && Number.isFinite(created) && created >= reviewed
}
/** An approved proposal is never execution or learning evidence. */
export function actionFollowup(cycle: ActionCycle, metrics: ReturnType<typeof verifiedLearningMetrics>): ActionFollowup {
  return { cycleId: cycle.id, metrics, status: metrics.verifiedTransferScorePct !== null ? 'reviewed'
    : metrics.transferScorePct !== null ? 'measured' : metrics.baselineScorePct !== null ? 'started' : 'assigned' }
}
export function evidenceFacts(evidence: Record<string, unknown> | null) {
  const source = evidence || {}
  const keys = ['answeredItems', 'independentItems', 'evidenceCount', 'questionCount', 'sessionCount'] as const
  return keys.flatMap(key => typeof source[key] === 'number' && Number.isInteger(source[key]) && Number(source[key]) >= 0
    ? [{ key, value: Number(source[key]) }] : [])
}
