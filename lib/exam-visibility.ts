// Sınav Simülasyonu: öğrencinin sınıfına göre görünen sınavlar.
// 6-8. sınıf → LGS; 10. sınıftan itibaren → üniversite sınavları (TYT, AYT, YDT).
// Sınıf bilinmiyorsa (ör. üniversite/boş profil) hiçbir sınav gizlenmez.
export const LGS_EXAMS = ['LGS']
export const UNIVERSITY_EXAMS = ['TYT', 'AYT', 'YDT']

export function examKeysForGrade(grade: number | null, allKeys: string[]): string[] {
  if (grade === null) return allKeys
  if (grade >= 6 && grade <= 8) return allKeys.filter(key => LGS_EXAMS.includes(key))
  if (grade >= 10) return allKeys.filter(key => UNIVERSITY_EXAMS.includes(key))
  return []
}
