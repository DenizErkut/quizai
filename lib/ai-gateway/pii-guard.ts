// Dış yapay zekâ sağlayıcılarına giden metinlerden kişisel veriyi temizler (veri minimizasyonu / KVKK).
// Kural: öğrencinin adı, e-postası, telefonu, T.C. kimlik no ve IBAN bilgisi hiçbir istemde sağlayıcıya gitmez.
// Bu bir ikinci savunma hattıdır; asıl kural, istemlere kimlik verisini hiç koymamaktır.

/** İstemlerde öğrenci adı yerine kullanılacak sabit etiket. */
export const STUDENT_LABEL = 'Öğrenci'

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const IBAN = /\bTR\d{2}(?:[ ]?\d{4}){5}[ ]?\d{2}\b/gi
const CANDIDATE_TC = /(?<!\d)[1-9]\d{10}(?!\d)/g
// +90 5xx xxx xx xx, 05xx..., 5xx... (boşluk/tire/parantez toleranslı). Kısa sayıları (ör. 2024, 45 cm) etkilemez.
const PHONE = /(?<![\d.,])(?:\+?90[\s.-]?)?\(?0?5\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}(?![\d])/g

/** T.C. kimlik numarası sağlama kuralı (11 hane, son iki hane kontrol). */
export function isValidTcNumber(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false
  const d = value.split('').map(Number)
  const odd = d[0] + d[2] + d[4] + d[6] + d[8]
  const even = d[1] + d[3] + d[5] + d[7]
  const tenth = (((odd * 7 - even) % 10) + 10) % 10
  const eleventh = d.slice(0, 10).reduce((sum, n) => sum + n, 0) % 10
  return d[9] === tenth && d[10] === eleventh
}

/** Metindeki e-posta, telefon, IBAN ve (geçerli) T.C. kimlik numaralarını etiketlerle değiştirir. */
export function maskPii(text: string): string {
  if (!text) return text
  return text
    .replace(EMAIL, '[e-posta]')
    .replace(IBAN, '[iban]')
    .replace(CANDIDATE_TC, match => (isValidTcNumber(match) ? '[kimlik-no]' : match))
    .replace(PHONE, '[telefon]')
}

/** Metinde maskelenecek kişisel veri var mı? */
export function containsPii(text: string): boolean {
  return Boolean(text) && maskPii(text) !== text
}
