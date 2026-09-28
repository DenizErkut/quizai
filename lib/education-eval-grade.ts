import { questionBankKey } from '@/lib/question-bank'

export function educationEvalGradeKey(value: unknown) {
  const grade = String(value || '').trim()
  const number = grade.match(/\d{1,2}/)?.[0]
  // questionBankKey preserves Turkish dotless ı; use the numeric class as
  // the canonical scope so "5" and "5. sınıf" resolve to the same grade.
  return number ? `grade:${Number(number)}` : questionBankKey(grade)
}
