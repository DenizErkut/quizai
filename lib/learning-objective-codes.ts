const OBJECTIVE_CODE_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._/-]{0,63}$/u

export function normalizeLearningObjectiveCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toLocaleUpperCase('tr-TR')
  return OBJECTIVE_CODE_PATTERN.test(code) ? code : null
}

/** Accepts a textarea value, a JSON array, or a database array. */
export function parseLearningObjectiveCodes(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,;]+/u)
      : []

  const codes = new Set<string>()
  for (const value of values) {
    const code = normalizeLearningObjectiveCode(value)
    if (code) codes.add(code)
    if (codes.size >= 100) break
  }
  return [...codes]
}

export function matchVerifiedObjectiveCode(value: unknown, verifiedCodes: Iterable<string>): string | null {
  const candidate = normalizeLearningObjectiveCode(value)
  if (!candidate) return null
  for (const verifiedCode of verifiedCodes) {
    if (normalizeLearningObjectiveCode(verifiedCode) === candidate) return candidate
  }
  return null
}
