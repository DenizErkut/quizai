import type { SupabaseClient } from '@supabase/supabase-js'

/** Capabilities are allow-listed per agent. Unknown agents/actions are denied. */
export type AgentCapability =
  | 'read_own_learning_history'
  | 'read_assigned_student_data'
  | 'read_curriculum'
  | 'read_approved_content'
  | 'return_user_facing_output'
  | 'persist_own_conversation'
  | 'send_preference_enabled_in_app_nudge'
  | 'write_teacher_analysis'
  | 'propose_content_draft'
  | 'verify_content'
  | 'write_decision_audit'

export type BoundedAgentName =
  | 'study-plan-v1'
  | 'review-plan-v1'
  | 'progress-summary-v1'
  | 'ai-tutor-v1'
  | 'student-coach-v1'
  | 'teacher-student-analysis-v1'
  | 'learning-graph-proposer-v1'
  | 'question-verifier-v1'

const policy: Record<BoundedAgentName, readonly AgentCapability[]> = {
  'study-plan-v1': ['read_own_learning_history', 'return_user_facing_output', 'write_decision_audit'],
  'review-plan-v1': ['read_own_learning_history', 'read_approved_content', 'return_user_facing_output', 'write_decision_audit'],
  'progress-summary-v1': ['read_own_learning_history', 'return_user_facing_output', 'write_decision_audit'],
  'ai-tutor-v1': ['read_own_learning_history', 'return_user_facing_output', 'write_decision_audit'],
  'student-coach-v1': ['read_own_learning_history', 'return_user_facing_output', 'persist_own_conversation', 'send_preference_enabled_in_app_nudge', 'write_decision_audit'],
  'teacher-student-analysis-v1': ['read_assigned_student_data', 'write_teacher_analysis', 'write_decision_audit'],
  'learning-graph-proposer-v1': ['read_curriculum', 'propose_content_draft', 'write_decision_audit'],
  'question-verifier-v1': ['verify_content', 'write_decision_audit'],
}

export function agentCan(agent: string, capability: string): boolean {
  return Object.prototype.hasOwnProperty.call(policy, agent)
    && policy[agent as BoundedAgentName].includes(capability as AgentCapability)
}

export function requireAgentCapability(agent: string, capability: AgentCapability): void {
  if (!agentCan(agent, capability)) throw new Error(`agent_capability_denied:${agent}:${capability}`)
}

/** These student-facing agents cannot read another student's records. */
export function requireOwnStudentScope(agent: BoundedAgentName, actorId: string, subjectId: string): void {
  requireAgentCapability(agent, 'read_own_learning_history')
  if (!actorId || !subjectId || actorId !== subjectId) throw new Error(`agent_subject_scope_denied:${agent}`)
}

/** Teacher agents must prove both classroom ownership and active student membership. */
export function requireAssignedStudentScope(
  agent: BoundedAgentName,
  verifiedClassroomOwnerId: string | null | undefined,
  expectedTeacherId: string,
  memberStudentId: string | null | undefined,
  requestedStudentId: string,
): void {
  requireAgentCapability(agent, 'read_assigned_student_data')
  if (!verifiedClassroomOwnerId || verifiedClassroomOwnerId !== expectedTeacherId || !memberStudentId || memberStudentId !== requestedStudentId) {
    throw new Error(`agent_assigned_student_scope_denied:${agent}`)
  }
}

type AgentAuditRecord = {
  actor_id: string
  agent_name: BoundedAgentName
  policy_version: string
  input_summary: Record<string, unknown>
  decision_summary: Record<string, unknown>
}

/** Fail closed: do not return an agent decision if its audit event cannot be persisted. */
export async function writeAgentDecisionAudit(db: SupabaseClient, record: AgentAuditRecord): Promise<void> {
  requireAgentCapability(record.agent_name, 'write_decision_audit')
  const { error } = await db.from('agent_decision_audit').insert(record)
  if (error) throw new Error(`agent_audit_write_failed:${error.code || 'unknown'}`)
}
