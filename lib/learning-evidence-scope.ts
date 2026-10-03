import { questionBankKey } from './question-bank'

/** Only recognized school-grade forms are equivalent; missing scopes fail closed. */
export function learningGradeKey(value: unknown): string | null {
  const key = questionBankKey(value)
  const match = key.match(/^(?:(?:ilkokul|ortaokul|lise)\s+)?(\d{1,2})(?:\s+(?:sinif|sınıf))?$/)
  if (!match) return null
  const grade = Number(match[1])
  return grade >= 1 && grade <= 12 ? `grade:${grade}` : null
}

export function sameLearningScope(a: { grade: unknown; subject: unknown }, b: { grade: unknown; subject: unknown }): boolean {
  const grade = learningGradeKey(a.grade)
  const subject = questionBankKey(a.subject)
  return Boolean(grade && subject && grade === learningGradeKey(b.grade) && subject === questionBankKey(b.subject))
}
