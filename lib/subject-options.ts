// Sınıfa göre ders önerileri (yönetici formlarında otomatik liste).
import { getSubjectsForGrade } from './subject-map-grade'

export function subjectOptionsForGrade(gradeNumber: number): string[] {
  return Object.keys(getSubjectsForGrade(`${gradeNumber}. sınıf`))
}
