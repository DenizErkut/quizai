export interface ImportRosterStudent {
  id: string
  schoolNo: string | null
  fullName: string
  classroomName?: string | null
}

function normalize(value: string): string {
  return value.toLocaleUpperCase('tr-TR').replace(/İ/g, 'I').replace(/Ğ/g, 'G')
    .replace(/Ü/g, 'U').replace(/Ş/g, 'S').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function matchImportStudent(roster: ImportRosterStudent[], schoolNo: string, name: string, classroom: string): {
  studentId: string | null; matchType: 'school_no' | 'name' | 'none'
} {
  const candidates = classroom.trim()
    ? roster.filter(student => normalize(student.classroomName || '') === normalize(classroom)) : roster
  // An explicit but unknown/ambiguous school number must never silently fall
  // back to a similarly named student. Require manual selection instead.
  const matches = schoolNo.trim()
    ? candidates.filter(student => student.schoolNo?.trim() === schoolNo.trim())
    : name.trim() ? candidates.filter(student => normalize(student.fullName) === normalize(name)) : []
  if (matches.length !== 1) return { studentId: null, matchType: 'none' }
  if (schoolNo.trim() && name.trim() && normalize(matches[0].fullName) !== normalize(name)) {
    return { studentId: null, matchType: 'none' }
  }
  return { studentId: matches[0].id, matchType: schoolNo.trim() ? 'school_no' : 'name' }
}
