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

// Serbest metin olarak girilen/import edilen ders adlarındaki yaygın
// varyasyonları SUBJECT_MAP'teki kanonik isme çevirir. "Fen" ile "Fen
// Bilimleri" gibi aslında aynı dersin farklı yazımlarının raporlarda ayrı
// sütun/başlık olarak görünmesini engeller.
const SUBJECT_ALIASES: Record<string, string> = {
  'fen': 'Fen Bilimleri',
  'fen bilgisi': 'Fen Bilimleri',
  'fen bilimleri dersi': 'Fen Bilimleri',
  'matematik dersi': 'Matematik',
  'mat': 'Matematik',
  'türkçe dersi': 'Türkçe',
  'turkce': 'Türkçe',
  'türkçe dil ve anlatım': 'Türkçe',
  'ingilizce dersi': 'İngilizce',
  'ingilizce': 'İngilizce',
  'sosyal': 'Sosyal Bilgiler',
  'sosyal bilgiler dersi': 'Sosyal Bilgiler',
  'din': 'Din Kültürü ve Ahlak Bilgisi',
  'din kültürü': 'Din Kültürü ve Ahlak Bilgisi',
  'din k.ve a.b.': 'Din Kültürü ve Ahlak Bilgisi',
  'din kültürü ve ahlak bilgisi dersi': 'Din Kültürü ve Ahlak Bilgisi',
  'beden': 'Beden Eğitimi',
  'beden eğitimi dersi': 'Beden Eğitimi',
  'görsel sanat': 'Görsel Sanatlar',
  'resim': 'Görsel Sanatlar',
  'hayat bilgisi dersi': 'Hayat Bilgisi',
}

// Türkçe karakter/boşluk/nokta farklarına duyarsız normalize eder — hem
// aday hem sözlük anahtarı için aynı fonksiyonla karşılaştırma yapılır.
// ÖNEMLİ: İ/I harflerini elle çeviriyoruz çünkü toLocaleLowerCase('tr-TR')
// büyük "I"yı "ı" (noktasız) yapar, "i" değil — "Ingilizce" gibi Türkçe
// klavyesiz yazılmış girdiler bu yüzden sözlükte hiç eşleşmezdi.
function normalizeKey(s: string): string {
  return s.trim().replace(/İ/g, 'i').replace(/I/g, 'i')
    .toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')
}

export function normalizeSubjectName(raw: string): string {
  const key = normalizeKey(raw)
  return SUBJECT_ALIASES[key] || raw.trim()
}

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
