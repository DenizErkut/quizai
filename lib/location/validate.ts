// Konum alanları (ülke / eyalet-il / şehir-ilçe) için saf doğrulama ve etiket yardımcıları.
// country = ISO 3166-1 alpha-2; state/city = seçilen ya da (listede yoksa) yazılan ad.
// Posta kodu ve açık adres kimlik verisidir (TR-PG identities); profiles'a yazılmaz.

export interface LocationValue { country: string; state: string; city: string }
export interface LocationDetails extends LocationValue { postalCode: string; addressLine: string }

export const EMPTY_LOCATION: LocationValue = { country: '', state: '', city: '' }
export const EMPTY_LOCATION_DETAILS: LocationDetails = { ...EMPTY_LOCATION, postalCode: '', addressLine: '' }

export const MAX_PLACE_LENGTH = 120
export const MAX_POSTAL_LENGTH = 20
export const MAX_ADDRESS_LENGTH = 300

const POSTAL = /^[A-Za-z0-9][A-Za-z0-9 \-]{1,19}$/

export function cleanPlace(value: unknown): string {
  return typeof value === 'string' ? value.normalize('NFKC').replace(/\s+/g, ' ').trim() : ''
}

export function cleanCountry(value: unknown): string {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

export type LocationError = 'country' | 'state' | 'city' | 'postal' | 'address'

/** Ülke, eyalet ve şehir zorunlu; posta kodu ve açık adres opsiyonel (verilirse biçimi doğrulanır). */
export function validateLocationDetails(input: Partial<LocationDetails>): { ok: true; value: LocationDetails } | { ok: false; field: LocationError } {
  const country = cleanCountry(input.country)
  const state = cleanPlace(input.state)
  const city = cleanPlace(input.city)
  const postalCode = cleanPlace(input.postalCode)
  const addressLine = typeof input.addressLine === 'string' ? input.addressLine.normalize('NFKC').replace(/[ \t]+/g, ' ').trim() : ''
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, field: 'country' }
  if (!state || state.length > MAX_PLACE_LENGTH) return { ok: false, field: 'state' }
  if (!city || city.length > MAX_PLACE_LENGTH) return { ok: false, field: 'city' }
  if (postalCode && (postalCode.length > MAX_POSTAL_LENGTH || !POSTAL.test(postalCode))) return { ok: false, field: 'postal' }
  if (addressLine.length > MAX_ADDRESS_LENGTH) return { ok: false, field: 'address' }
  return { ok: true, value: { country, state, city, postalCode, addressLine } }
}

/** Müfredat için: ülke zorunlu; eyalet/şehir boşsa müfredat ülke genelindedir. */
export function validateCurriculumScope(input: Partial<LocationValue>): { ok: true; value: LocationValue } | { ok: false; field: 'country' | 'state' | 'city' } {
  const country = cleanCountry(input.country)
  const state = cleanPlace(input.state)
  const city = cleanPlace(input.city)
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, field: 'country' }
  if (state.length > MAX_PLACE_LENGTH) return { ok: false, field: 'state' }
  if (city.length > MAX_PLACE_LENGTH) return { ok: false, field: 'city' }
  if (city && !state) return { ok: false, field: 'state' }
  return { ok: true, value: { country, state, city } }
}

/** Türkiye'de eyalet = il, şehir = ilçe; diğer ülkelerde eyalet/bölge ve şehir. */
export function placeLabels(country: string): { state: string; city: string } {
  return country === 'TR' ? { state: 'İl', city: 'İlçe' } : { state: 'Eyalet / Bölge', city: 'Şehir' }
}

export function countryDisplayName(code: string, intlLocale: string, fallback?: string): string {
  try {
    const name = new Intl.DisplayNames([intlLocale], { type: 'region' }).of(code)
    if (name && name !== code) return name
  } catch { /* desteklenmeyen kod/locale */ }
  return fallback || code
}

export function locationSummary(value: Partial<LocationValue> & { country?: string | null }, intlLocale = 'tr-TR'): string {
  const parts = [value.city, value.state].map(cleanPlace).filter(Boolean)
  const country = value.country ? countryDisplayName(cleanCountry(value.country), intlLocale) : ''
  return [...parts, country].filter(Boolean).join(', ')
}

function slug(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** Müfredat sürüm kodunun konum eki: Türkiye geneli ekstra ek almaz (mevcut kodlar korunur). */
export function curriculumScopeSuffix(scope: LocationValue): string {
  if (scope.country === 'TR' && !scope.state && !scope.city) return ''
  return [scope.country, slug(scope.state), slug(scope.city)].filter(Boolean).map(part => `-${part}`).join('')
}

export function scopeLabel(scope: Partial<LocationValue> | null | undefined, intlLocale = 'tr-TR'): string {
  if (!scope?.country) return ''
  const parts = [scope.country ? countryDisplayName(cleanCountry(scope.country), intlLocale) : '', cleanPlace(scope.state), cleanPlace(scope.city)].filter(Boolean)
  return parts.join(' › ')
}
