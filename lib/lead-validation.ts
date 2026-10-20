// Herkese açık "özel koçluk" talep formu için girdi doğrulama (uzunluk sınırı ve e-posta biçimi).
export interface LeadInput {
  leadType: 'kurum' | 'bireysel'
  name: string
  email: string
  phone: string | null
  institutionName: string | null
  studentGrade: string | null
  message: string | null
}

const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,24}$/

function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return null
  const trimmed = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim()
  return trimmed.length > max ? null : trimmed || null
}

export function validateLead(body: unknown): { ok: true; value: LeadInput } | { ok: false; error: string } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (b.leadType !== 'kurum' && b.leadType !== 'bireysel') return { ok: false, error: 'Geçersiz talep türü.' }
  const name = text(b.name, 100)
  const email = text(b.email, 254)
  if (!name || !email) return { ok: false, error: 'İsim ve e-posta zorunlu.' }
  if (!EMAIL.test(email)) return { ok: false, error: 'Geçerli bir e-posta girin.' }
  for (const [key, max] of [['phone', 40], ['institutionName', 150], ['studentGrade', 60], ['message', 2000]] as const) {
    if (typeof b[key] === 'string' && (b[key] as string).trim().length > max) return { ok: false, error: 'Alanlardan biri çok uzun.' }
  }
  return { ok: true, value: { leadType: b.leadType, name, email, phone: text(b.phone, 40), institutionName: text(b.institutionName, 150), studentGrade: text(b.studentGrade, 60), message: text(b.message, 2000) } }
}
