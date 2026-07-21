// lib/student-report-topics.ts
// quiz_sessions.topic (serbest metin) -> ders adı eşlemesi. SUBJECT_MAP
// (lib/subject-map.ts) üzerinden konu->ders sözlüğü kurar; sözlükte
// bulunamayan (öğretmenin canlı quiz'de kendi yazdığı serbest konu gibi)
// konular "Diğer" başlığı altında toplanır.

import { SUBJECT_MAP } from './subject-map'

function levelFromGrade(grade: string | null | undefined): string {
  if (!grade) return 'ortaokul'
  const g = grade.toLocaleLowerCase('tr-TR')
  if (g.includes('ilkokul')) return 'ilkokul'
  if (g.includes('ortaokul')) return 'ortaokul'
  if (g.includes('lise')) return 'lise'
  if (g.includes('universite') || g.includes('üniversite')) return 'universite'
  return 'ortaokul'
}

function normalize(s: string): string {
  return s.toLocaleLowerCase('tr-TR').trim()
}

// level -> (normalize edilmiş konu -> ders) sözlüğü, bir kere kurulur.
const topicToSubjectCache: Record<string, Map<string, string>> = {}

function getTopicMap(level: string): Map<string, string> {
  if (topicToSubjectCache[level]) return topicToSubjectCache[level]
  const map = new Map<string, string>()
  const subjects = SUBJECT_MAP[level] ?? {}
  for (const [subject, topics] of Object.entries(subjects)) {
    for (const topic of topics) map.set(normalize(topic), subject)
  }
  topicToSubjectCache[level] = map
  return map
}

export const DIGER_DERS = 'Diğer'

// Bir quiz_sessions satırının konusunu (topic) + seviyesini (grade) alıp
// hangi derse ait olduğunu döner. Eşleşme yoksa "Diğer" döner.
export function inferSubject(topic: string | null | undefined, grade: string | null | undefined): string {
  if (!topic) return DIGER_DERS
  const level = levelFromGrade(grade)
  const map = getTopicMap(level)
  const exact = map.get(normalize(topic))
  if (exact) return exact
  // Tam eşleşme yoksa, konu metni içinde bir müfredat konusu geçiyor mu diye
  // gevşek bir arama yap (örn. "Kesirler - toplama" gibi varyasyonlar için).
  const nt = normalize(topic)
  for (const [t, subj] of map) {
    if (nt.includes(t) || t.includes(nt)) return subj
  }
  return DIGER_DERS
}
