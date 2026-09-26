import { extractGradeNumber } from '@/lib/subject-map-grade'

/** Unknown or unparseable grades fail closed to prevent cross-grade retrieval. */
export function isSameGradeSource(
  requestedGrade: string | null | undefined,
  sourceGrade: string | null | undefined,
): boolean {
  const requested = extractGradeNumber(requestedGrade)
  if (requested === null || !sourceGrade) return false
  const source = extractGradeNumber(sourceGrade)
  if (source !== null) return source === requested
  const bare = sourceGrade.trim().match(/^(\d{1,2})$/)
  if (!bare) return false
  const grade = Number(bare[1])
  return grade >= 1 && grade <= 12 && grade === requested
}
