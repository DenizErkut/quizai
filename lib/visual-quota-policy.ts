import { dimensionKey } from './curriculum-keys'

// Visual-question quota by subject.
//  - numeric subjects (maths and sciences): at least 30% of a test uses a visual (the original rule);
//  - verbal subjects (Turkish, literature, history, social studies, languages, ...): visuals are optional,
//    attempted for roughly 10% only when the topic naturally suits one (map, timeline, table, chart).
// A missing or unknown subject keeps the original 30% rule, so nothing loosens by accident.
export type VisualProfile = 'numeric' | 'verbal'

export const NUMERIC_VISUAL_RATIO = 0.3
export const VERBAL_VISUAL_RATIO = 0.1
export const NEW_GENERATION_VISUAL_RATIO = 0.5 // "yeni nesil" requests, numeric subjects only
export const GEOMETRY_VISUAL_RATIO = 0.9 // geometri soruları: en az %90'ı gerçek görsel (şekil) taşır

// Matematik, Fen (Bilimleri / ve Teknoloji), Biyoloji, Kimya as requested, Cografya at the owner's request
// (maps, charts and climate data), plus Fizik and Geometri, which are the same family as the sciences
// (Fizik and Geometri were not on the requested list; remove them here to treat them as verbal).
const NUMERIC_SUBJECT = /^(matematik|geometri|fen( bilimleri| ve teknoloji)?|fizik|kimya|biyoloji|cografya)( |$)/

const KNOWN_VERBAL_SUBJECT = /^(turkce|turk dili|edebiyat|felsefe|sosyal bilgiler|tarih|ingilizce|almanca|fransizca|arapca|din kulturu|hayat bilgisi|t\.c\. inkilap|inkilap|psikoloji|sosyoloji|mantik)/

function asciiKey(subject: unknown): string {
  return dimensionKey(subject).replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
}

export function visualProfileForSubject(subject: unknown): VisualProfile {
  const key = asciiKey(subject)
  if (NUMERIC_SUBJECT.test(key)) return 'numeric'
  return KNOWN_VERBAL_SUBJECT.test(key) ? 'verbal' : 'numeric'
}

const GEOMETRY_TOPIC = /geometri|ucgen|dortgen|cokgen|cember|daire|aci|paralelkenar|yamuk|eskenar|dikdortgen|kare|prizma|piramit|silindir|koni|kure|simetri|donusum|ozdeslik|benzerlik|pisagor|alan ve cevre|cevre ve alan|geometrik|cisim|hacim/

/** Geometri sorusu mu? Ders adı "Geometri" ise ya da konu geometrik bir kavram içeriyorsa. */
export function isGeometryRequest(subject: unknown, topic?: unknown): boolean {
  if (asciiKey(subject).startsWith('geometri')) return true
  return GEOMETRY_TOPIC.test(asciiKey(topic))
}

/** Görsel oranı: geometri %90; diğer sayısal derslerde %30 (yeni nesil %50); sözel dersler ~%10. */
export function visualRatioFor(subject: unknown, topic?: unknown, newGeneration = false): number {
  if (isGeometryRequest(subject, topic)) return GEOMETRY_VISUAL_RATIO
  if (visualProfileForSubject(subject) === 'verbal') return VERBAL_VISUAL_RATIO
  return newGeneration ? NEW_GENERATION_VISUAL_RATIO : NUMERIC_VISUAL_RATIO
}

export function visualQuotaFor(subject: unknown, count: number, topic?: unknown) {
  const size = Math.max(0, Math.trunc(count))
  const geometry = isGeometryRequest(subject, topic)
  const profile = geometry ? 'numeric' as VisualProfile : visualProfileForSubject(subject)
  if (profile === 'numeric') {
    const ratio = geometry ? GEOMETRY_VISUAL_RATIO : NUMERIC_VISUAL_RATIO
    const required = Math.ceil(size * ratio)
    // same attempt budget as visualAttemptCount(): a small surplus to absorb quality-rejected visuals
    return { profile, required, attempts: size ? Math.min(size, required + Math.min(2, Math.floor(size / 2))) : 0, ratio }
  }
  return { profile, required: 0, attempts: Math.min(size, Math.ceil(size * VERBAL_VISUAL_RATIO)), ratio: VERBAL_VISUAL_RATIO }
}

/** How many visual-bearing questions the bank selection should aim for in a set of `count`. */
export function bankVisualTarget(subject: unknown, count: number, newGeneration: boolean, topic?: unknown): number {
  const size = Math.max(0, Math.trunc(count))
  if (isGeometryRequest(subject, topic)) return Math.min(size, Math.max(1, Math.ceil(size * GEOMETRY_VISUAL_RATIO)))
  if (visualProfileForSubject(subject) === 'verbal') return Math.min(size, Math.floor(size * VERBAL_VISUAL_RATIO))
  return Math.min(size, Math.max(1, Math.ceil(size * (newGeneration ? NEW_GENERATION_VISUAL_RATIO : NUMERIC_VISUAL_RATIO))))
}
