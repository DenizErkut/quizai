export const NEXT_OBJECTIVE_POLICY = 'next-objective-v1'

export type NextObjectivePlan = {
  policyVersion: string
  status: 'not_verified' | 'teacher_review' | 'baseline_required'
  candidate: { id: string; objectiveCode: string; title: string; grade: string | number | null; subject: string; topic: string | null } | null
  edgeId: string | null
  actionable: false
  reason: string
}

type Objective = {
  id: string; objective_code: string; title: string; grade: string | number | null; subject: string; topic?: string | null
  graph_node_id?: string | null; curriculum_version_id?: string | null; is_active?: boolean; verification_status?: string
}
type Edge = { id: string; source_node_id: string; target_node_id: string; edge_type: string; is_verified: boolean; reviewed_by?: string | null; valid_from?: string | null; valid_to?: string | null; curriculum_version_id?: string | null }

const current = (value: string | null | undefined, day: string) => !value || value <= day
const notExpired = (value: string | null | undefined, day: string) => !value || value >= day

/** Suggests a successor only from current, human-reviewed prerequisite edges. Never assigns a cycle. */
export function planNextObjective(input: { currentObjective: Objective; candidates: Objective[]; edges: Edge[]; verifiedMastery: boolean | null; today?: string }): NextObjectivePlan {
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const none = (status: NextObjectivePlan['status'], reason: string, edgeId: string | null = null): NextObjectivePlan => ({
    policyVersion: NEXT_OBJECTIVE_POLICY, status, candidate: null, edgeId, actionable: false, reason,
  })
  if (input.verifiedMastery !== true) return none('not_verified', 'Mevcut kazanım doğrulanmış öğrenme kanıtını tamamlamadı; sonraki kazanım seçilmedi.')
  const edges = input.edges.filter(edge => edge.edge_type === 'prerequisite_of' && edge.is_verified && Boolean(edge.reviewed_by)
    && current(edge.valid_from, today) && notExpired(edge.valid_to, today)
    && (!input.currentObjective.curriculum_version_id || !edge.curriculum_version_id || edge.curriculum_version_id === input.currentObjective.curriculum_version_id)
    && edge.source_node_id === input.currentObjective.graph_node_id)
  const eligible = edges.flatMap(edge => input.candidates.filter(candidate => candidate.graph_node_id === edge.target_node_id
    && candidate.is_active !== false && candidate.verification_status === 'verified'
    && String(candidate.grade) === String(input.currentObjective.grade) && candidate.subject === input.currentObjective.subject
    && (!input.currentObjective.curriculum_version_id || !candidate.curriculum_version_id || candidate.curriculum_version_id === input.currentObjective.curriculum_version_id)
  ).map(candidate => ({ candidate, edge })))
  const unique = new Map(eligible.map(item => [item.candidate.id, item]))
  if (unique.size !== 1) return none('teacher_review', unique.size > 1
    ? 'Birden fazla güncel ön koşul adayı var; sonraki kazanımı öğretmen seçmeli.'
    : 'Güncel insan incelemeli ön koşul ilişkisi yok; otomatik sonraki kazanım seçilmedi.')
  const item = [...unique.values()][0]
  return {
    policyVersion: NEXT_OBJECTIVE_POLICY, status: 'baseline_required', edgeId: item.edge.id, actionable: false,
    candidate: { id: item.candidate.id, objectiveCode: item.candidate.objective_code, title: item.candidate.title, grade: item.candidate.grade, subject: item.candidate.subject, topic: item.candidate.topic ?? null },
    reason: 'Sonraki kazanım için önce öğretmen planı ve bu kazanımda yeni, yardımsız başlangıç ölçümü gerekiyor; mevcut tahmin başlangıç kanıtı yerine geçmez.',
  }
}
