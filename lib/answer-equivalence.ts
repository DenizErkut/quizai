// Tier 0 (deterministik) cevap denkliği — yapay zekâ çağrısından ÖNCE denenir (AI altyapı planı P1-4).
// Yalnızca yüksek güvenle karar verir: 'equal' (aynı), 'different' (aynı birimde farklı sayı), aksi halde 'unknown'
// (çağıran, gerekiyorsa mevcut yapay zekâ yoluna düşer). Asla "belki"yi doğru saymaz.

export type Equivalence = 'equal' | 'different' | 'unknown'

const UNITS = ['km', 'mm', 'cm', 'dm', 'm', 'kg', 'mg', 'g', 'ml', 'l', 'lt', 'sn', 'dk', 'sa', 'saat', 'saniye', 'dakika', 'derece', '°c', '°', 'tl', '₺', '%', 'cm2', 'cm3', 'm2', 'm3', 'm²', 'm³', 'cm²', 'cm³']
const UNIT_SET = new Set(UNITS)

/** Türkçe duyarlı küçük harf + boşluk/noktalama sadeleştirme (sayı ayırıcıları korunur). */
export function normalizeAnswerText(input: string): string {
  return String(input ?? '')
    .normalize('NFC')
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLocaleLowerCase('tr')
    .replace(/[“”"'`´’‘]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;:]+$/g, '')
    .trim()
}

/** "1.234,56" / "1,5" / "1.5" / "3/4" → sayı. Belirsiz ("2.500") ya da tanınmayan biçim → null. */
export function parseNumberLiteral(raw: string): number | null {
  const s = raw.trim().replace(/\s+/g, '')
  if (!s) return null
  const fraction = /^(-?\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)$/.exec(s)
  if (fraction) {
    const a = parseNumberLiteral(fraction[1]); const b = parseNumberLiteral(fraction[2])
    return a !== null && b !== null && b !== 0 ? a / b : null
  }
  if (!/^-?[\d.,]+$/.test(s)) return null
  const hasDot = s.includes('.'); const hasComma = s.includes(',')
  let normalized: string
  if (hasDot && hasComma) {
    // Son ayırıcı ondalıktır; diğeri binlik.
    const decimalIsComma = s.lastIndexOf(',') > s.lastIndexOf('.')
    normalized = decimalIsComma ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (hasComma) {
    if ((s.match(/,/g) || []).length > 1) return null
    normalized = s.replace(',', '.')
  } else if (hasDot) {
    if ((s.match(/\./g) || []).length > 1) return null
    if (/^-?\d+\.\d{3}$/.test(s)) return null // "2.500": binlik mi ondalık mı? belirsiz → karar verme
    normalized = s
  } else normalized = s
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

export interface Quantity { value: number; unit: string | null }

/** "5 cm", "%50", "50%", "3/4", "1,25" → { value, unit }. Tanınmazsa null. */
export function parseQuantity(input: string): Quantity | null {
  const text = normalizeAnswerText(input).replace(/\s*\^\s*/g, '')
  if (!text) return null
  const percentPrefix = /^%\s*(.+)$/.exec(text)
  if (percentPrefix) { const v = parseNumberLiteral(percentPrefix[1]); return v === null ? null : { value: v, unit: '%' } }
  const match = /^(-?[\d.,/]+)\s*([^\d\s].*)?$/.exec(text)
  if (!match) return null
  const value = parseNumberLiteral(match[1])
  if (value === null) return null
  const unit = match[2] ? match[2].trim() : null
  if (unit !== null && !UNIT_SET.has(unit)) return null
  return { value, unit }
}

const sameNumber = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))

/** İki cevabı AI'sız karşılaştırır. */
export function compareAnswers(correct: string, given: string): Equivalence {
  const a = normalizeAnswerText(correct); const b = normalizeAnswerText(given)
  if (!a || !b) return 'unknown'
  if (a === b) return 'equal'
  const qa = parseQuantity(a); const qb = parseQuantity(b)
  if (qa && qb) {
    if (qa.unit !== qb.unit) return 'unknown' // birim eksik/farklı: öğretmenin niyetine göre; AI/insan karar versin
    return sameNumber(qa.value, qb.value) ? 'equal' : 'different'
  }
  return 'unknown'
}
