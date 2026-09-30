import type { SupabaseClient } from '@supabase/supabase-js'
import { SUBJECT_MAP } from './subject-map'
import { SUBJECT_MAP_BY_GRADE, extractGradeNumber } from './subject-map-grade'

export const OPEN_ENDED_GRADE_KEYS = ['1','2','3','4','5','6','7','8','9','10','11','12','universite'] as const
export type OpenEndedGradeKey = typeof OPEN_ENDED_GRADE_KEYS[number]
export type CatalogOverride = { id?: string; grade_key: string; subject: string; topics: string[]; is_active: boolean }
export type CatalogSubject = { id: string | null; subject: string; topics: string[]; isActive: boolean; customized: boolean }

export function gradeKeyFromProfile(grade: string | null | undefined): OpenEndedGradeKey {
  if (grade?.toLocaleLowerCase('tr').includes('üniversite') || grade?.toLocaleLowerCase('tr').includes('universite')) return 'universite'
  const number = extractGradeNumber(grade)
  return number ? String(number) as OpenEndedGradeKey : '6'
}

export function defaultOpenEndedSubjects(key: OpenEndedGradeKey): Record<string, string[]> {
  return key === 'universite' ? SUBJECT_MAP.universite : SUBJECT_MAP_BY_GRADE[key] ?? {}
}

export function normalizeCatalogTopics(topics: unknown): string[] | null {
  if (!Array.isArray(topics) || topics.length > 100) return null
  const normalized: string[] = []
  const seen = new Set<string>()
  for (const topic of topics) {
    if (typeof topic !== 'string' || topic.trim().length < 1 || topic.trim().length > 160) return null
    const value = topic.trim()
    const key = value.toLocaleLowerCase('tr')
    if (!seen.has(key)) { normalized.push(value); seen.add(key) }
  }
  return normalized
}

export function resolveOpenEndedCatalog(key: OpenEndedGradeKey, overrides: CatalogOverride[]): CatalogSubject[] {
  const result = new Map<string, CatalogSubject>()
  for (const [subject, topics] of Object.entries(defaultOpenEndedSubjects(key))) {
    result.set(subject.toLocaleLowerCase('tr'), { id: null, subject, topics, isActive: true, customized: false })
  }
  for (const row of overrides) {
    if (row.grade_key !== key) continue
    result.set(row.subject.toLocaleLowerCase('tr'), {
      id: row.id ?? null, subject: row.subject, topics: normalizeCatalogTopics(row.topics) ?? [],
      isActive: row.is_active, customized: true,
    })
  }
  return [...result.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'tr'))
}

export function isSelectableOpenEndedTopic(subjects: CatalogSubject[], subject: string, topic: string): boolean {
  return subjects.some(item => item.isActive && item.subject === subject && item.topics.includes(topic))
}

export async function loadOpenEndedCatalog(db: SupabaseClient, key: OpenEndedGradeKey): Promise<CatalogSubject[]> {
  const { data, error } = await db.from('open_ended_practice_catalog')
    .select('id,grade_key,subject,topics,is_active').eq('grade_key', key).order('subject')
  if (error) throw error
  return resolveOpenEndedCatalog(key, (data ?? []) as CatalogOverride[])
}
