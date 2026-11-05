// T.C. Kimlik No doğrulaması (biçim + sağlama basamakları). Numaranın gerçekten o kişiye ait olduğunu
// doğrulamaz (bunun için NVİ kimlik doğrulama servisi gerekir); yalnızca yazım hatalarını ve uydurma numaraları ayıklar.
// KVKK: değer yalnızca TR-PG kimlik veritabanında saklanır; günlüklere, hata iletilerine ve Supabase'e yazılmaz.

export function normalizeTcKimlikNo(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, '') : ''
}

export function validateTcKimlikNo(value: unknown): boolean {
  const tc = normalizeTcKimlikNo(value)
  if (!/^[1-9][0-9]{9}[0-9]$/.test(tc)) return false
  const d = tc.split('').map(Number)
  const odd = d[0] + d[2] + d[4] + d[6] + d[8]
  const even = d[1] + d[3] + d[5] + d[7]
  const tenth = (((odd * 7 - even) % 10) + 10) % 10
  if (d[9] !== tenth) return false
  const eleventh = d.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10
  return d[10] === eleventh
}

/** Günlük/ekran için maskeli gösterim: 123******45. */
export function maskTcKimlikNo(value: unknown): string {
  const tc = normalizeTcKimlikNo(value)
  return tc.length === 11 ? `${tc.slice(0, 3)}******${tc.slice(9)}` : ''
}

/** Ülke Türkiye ise (ya da henüz seçilmediyse) kimlik no zorunludur; başka ülkedeki öğrenciler için istenmez. */
export function tcKimlikRequired(role: string, country: string | null | undefined): boolean {
  if (role !== 'student') return true
  const code = (country || '').trim().toUpperCase()
  return !code || code === 'TR'
}
