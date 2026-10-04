import { questionBankKey } from '@/lib/question-bank'
import { educationEvalSubjectKey } from './education-eval-subject'

export function educationEvalGradeKey(value: unknown) {
  const grade = String(value || '').trim()
  const number = grade.match(/\d{1,2}/)?.[0]
  // questionBankKey preserves Turkish dotless ı; use the numeric class as
  // the canonical scope so "5" and "5. sınıf" resolve to the same grade.
  return number ? `grade:${Number(number)}` : questionBankKey(grade)
}

export function isEducationEvalObjectiveInScope(
  objective: { grade?: unknown; subject?: unknown; curriculum_version_id?: unknown },
  scope: { grade: unknown; subject: unknown; curriculumVersionId: unknown },
) {
  return educationEvalGradeKey(objective.grade) === educationEvalGradeKey(scope.grade)
    && educationEvalSubjectKey(objective.subject) === educationEvalSubjectKey(scope.subject)
    && String(objective.curriculum_version_id || '') === String(scope.curriculumVersionId || '')
}
