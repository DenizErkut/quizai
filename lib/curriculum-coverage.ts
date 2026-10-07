import { dimensionKey, numericGradeKey, sameGradeAndSubject } from './curriculum-keys'

export type CurriculumRow = { id: string; level?: string | null; grade: string; subject: string; topics?: unknown }
export type CatalogObjective = {
  grade: string | null; subject: string | null; topic: string | null; unit: string | null
  is_active?: boolean | null; verification_status?: string | null; lifecycle_status?: string | null
}

export type CoverageStatus = 'ok' | 'needs_backfill' | 'no_catalog_match' | 'ambiguous_grade'

export function isCurrentObjective(row: CatalogObjective): boolean {
  return row.is_active === true && row.verification_status === 'verified' && (row.lifecycle_status == null || row.lifecycle_status === 'active')
}

/** Topics a curriculum row can take from the current catalog (topic and unit values, de-duplicated). */
export function deriveTopics(row: { grade: string; subject: string }, objectives: CatalogObjective[]): string[] {
  const topics = objectives.filter(o => isCurrentObjective(o) && sameGradeAndSubject(row, o))
    .flatMap(o => [o.topic, o.unit].filter((v): v is string => typeof v === 'string' && v.trim() !== ''))
  return [...new Set(topics)]
}

export function storedTopics(row: CurriculumRow): string[] {
  return Array.isArray(row.topics) ? row.topics.filter((v): v is string => typeof v === 'string' && v.trim() !== '') : []
}

export function computeCurriculumCoverage(curriculum: CurriculumRow[], objectives: CatalogObjective[]) {
  const rows = curriculum.map(row => {
    const matching = objectives.filter(o => sameGradeAndSubject(row, o))
    const current = matching.filter(isCurrentObjective)
    const stored = storedTopics(row)
    const derived = deriveTopics(row, objectives)
    const missing = derived.filter(topic => !stored.includes(topic))
    const status: CoverageStatus = numericGradeKey(row.grade) === '' ? 'ambiguous_grade'
      : current.length === 0 && stored.length === 0 ? 'no_catalog_match'
      : missing.length > 0 ? 'needs_backfill' : 'ok'
    return {
      id: row.id, level: row.level ?? null, grade: row.grade, subject: row.subject, status,
      storedTopics: stored.length, derivedTopics: derived.length, missingTopics: missing.length,
      currentObjectives: current.length, otherObjectives: matching.length - current.length,
    }
  })
  // Catalog groups that no curriculum row will ever pick up.
  const orphans = new Map<string, { grade: string | null; subject: string | null; objectives: number }>()
  for (const objective of objectives) {
    if (curriculum.some(row => sameGradeAndSubject(row, objective))) continue
    const key = `${numericGradeKey(objective.grade) || objective.grade}|${dimensionKey(objective.subject)}`
    const entry = orphans.get(key) ?? { grade: objective.grade, subject: objective.subject, objectives: 0 }
    entry.objectives += 1
    orphans.set(key, entry)
  }
  const count = (status: CoverageStatus) => rows.filter(row => row.status === status).length
  return {
    totals: {
      catalogRows: objectives.length,
      currentObjectives: objectives.filter(isCurrentObjective).length,
      otherObjectives: objectives.filter(o => !isCurrentObjective(o)).length,
      curriculumRows: rows.length,
      ok: count('ok'), needsBackfill: count('needs_backfill'), noCatalogMatch: count('no_catalog_match'), ambiguousGrade: count('ambiguous_grade'),
    },
    rows,
    orphanGroups: [...orphans.values()].sort((a, b) => b.objectives - a.objectives),
  }
}
