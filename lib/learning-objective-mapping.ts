import type { SupabaseClient } from '@supabase/supabase-js'

export interface CanonicalObjectiveCandidate {
  ref: string
  id: string
  objectiveCode: string
  title: string
  subject: string
  grade: string
  unit: string | null
  topic: string | null
  curriculumVersionId: string
  revisionId: string
  matchBasis: 'topic_exact' | 'unit_exact' | 'reviewed_alias'
}

interface ObjectiveRow {
  id: string
  objective_code: string
  title: string
  subject: string
  grade: string
  unit: string | null
  topic: string | null
  curriculum_version_id: string
  current_revision_id: string
  match_basis: 'topic_exact' | 'unit_exact' | 'reviewed_alias'
}

function dimensionKey(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()
    : ''
}

function gradeKey(value: unknown): string {
  return dimensionKey(value)
    .replace(/sinif/g, 'sınıf')
    .replace(/^(ilk\s*okul|orta\s*okul|lise|üniversite|universite)\s+/, '')
    .replace(/(\d+)\s*\.\s*sınıf/g, '$1. sınıf')
}

/** Loads only already-published objectives. No AI/free-text inference occurs. */
export async function loadCanonicalObjectiveCandidates(
  supabase: SupabaseClient,
  context: { subject?: string | null; grade?: string | null; topic?: string | null },
  maxCandidates = 24
): Promise<CanonicalObjectiveCandidate[]> {
  if (!context.subject || !context.grade || !context.topic) return []

  const { data, error } = await supabase.rpc('find_learning_objective_candidates_v2', {
    p_subject: context.subject.trim(),
    p_grade: gradeKey(context.grade),
    p_topic: context.topic.trim(),
    p_limit: Math.max(1, Math.min(50, maxCandidates)),
  })
  if (error) throw error

  return ((data || []) as ObjectiveRow[])
    .sort((a, b) => a.objective_code.localeCompare(b.objective_code, 'tr'))
    .slice(0, Math.max(1, Math.min(50, maxCandidates)))
    .map((row, index) => ({
      ref: `LO${index + 1}`,
      id: row.id,
      objectiveCode: row.objective_code,
      title: row.title,
      subject: row.subject,
      grade: row.grade,
      unit: row.unit,
      topic: row.topic,
      curriculumVersionId: row.curriculum_version_id,
      revisionId: row.current_revision_id,
      matchBasis: row.match_basis,
    }))
}

export function learningObjectivePrompt(candidates: CanonicalObjectiveCandidate[]): string {
  if (!candidates.length) return ''
  const options = candidates.map(candidate =>
    `${candidate.ref}: [${candidate.objectiveCode}] ${candidate.title}`
  ).join('\n')
  return `\n\nKANONİK KAZANIM EŞLEŞTİRME KURALI:\n` +
    `Aşağıdaki liste bu test için sunucu tarafından doğrulanmış tek kazanım kümesidir:\n${options}\n` +
    `Her soruya "learningObjectiveRef" alanı ekle. Soru listedeki bir kazanımı doğrudan ölçüyorsa yalnızca ilgili LO referansını yaz (ör. "LO1"); hiçbir kazanımı doğrudan ölçmüyorsa null yaz. ` +
    `Listede olmayan referans, UUID, kazanım kodu veya yeni kazanım üretme.`
}

export function applyCanonicalObjectiveMappings(
  questions: Array<Record<string, unknown>>,
  candidates: CanonicalObjectiveCandidate[]
): { questions: Array<Record<string, unknown>>; mappedCount: number } {
  const byRef = new Map(candidates.map(candidate => [candidate.ref, candidate]))
  let mappedCount = 0
  const mappedQuestions = questions.map(question => {
    // Modelden gelebilecek doğrudan kimlikleri hiçbir zaman güvenilir kabul etme.
    const { learningObjectiveId: _id, learning_objective_id: _snakeId,
      learningObjectiveCode: _code, curriculumVersionId: _versionId,
      learningObjectiveRevisionId: _revisionId, objectiveCandidateBasis: _basis,
      ...safeQuestion } = question
    void _id; void _snakeId; void _code; void _versionId; void _revisionId; void _basis
    const rawRef = typeof question.learningObjectiveRef === 'string'
      ? question.learningObjectiveRef.trim().toUpperCase()
      : ''
    const candidate = byRef.get(rawRef)
    if (!candidate) {
      return {
        ...safeQuestion,
        learningObjectiveRef: null,
        learningObjectiveId: null,
        learningObjectiveCode: null,
        curriculumVersionId: null,
        learningObjectiveRevisionId: null,
        objectiveCandidateBasis: null,
        objectiveMappingStatus: candidates.length ? 'unmapped' : 'no_candidates',
        objectiveMappingVersion: 'v1',
      }
    }
    mappedCount++
    return {
      ...safeQuestion,
      learningObjectiveRef: candidate.ref,
      learningObjectiveId: candidate.id,
      learningObjectiveCode: candidate.objectiveCode,
      curriculumVersionId: candidate.curriculumVersionId,
      learningObjectiveRevisionId: candidate.revisionId,
      objectiveCandidateBasis: candidate.matchBasis,
      objectiveMappingStatus: 'mapped',
      objectiveMappingVersion: 'v1',
    }
  })
  return { questions: mappedQuestions, mappedCount }
}
