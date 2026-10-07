// One definition of how curriculum rows and catalog objectives are matched.
// Matching is by normalized subject text and the numeric grade; a row whose
// grade has no number (e.g. "Hazırlık") never matches anything, instead of
// matching every other grade-less row.
export function dimensionKey(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim() : ''
}

export function numericGradeKey(value: unknown): string {
  return dimensionKey(value).replace(/[^0-9]/g, '')
}

export function sameGradeAndSubject(a: { grade?: unknown; subject?: unknown }, b: { grade?: unknown; subject?: unknown }): boolean {
  const grade = numericGradeKey(a.grade)
  return grade !== '' && grade === numericGradeKey(b.grade) && dimensionKey(a.subject) !== '' && dimensionKey(a.subject) === dimensionKey(b.subject)
}
