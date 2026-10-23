// Kaynak, kitapçık ve soru havuzu kayıtlarının konum kapsamı: ülke zorunlu, eyalet/şehir boşsa ülke geneli.
// Kullanıcının konumu yoksa (eski hesaplar, yönetici) Türkiye varsayılır; mevcut tüm veri TR olarak işaretli.
import { scopeApplies, hasLocation, type ScopeLike } from './curriculum-scope'
import { validateCurriculumScope } from './validate'

export const DEFAULT_COUNTRY = 'TR'

export type ResourceScope = { country: string; state: string | null; city: string | null }

/** Yükleme isteğindeki ülke/eyalet/şehir alanlarını doğrular; ülke zorunludur. */
export function parseResourceScope(input: { country?: unknown; state?: unknown; city?: unknown }):
  { ok: true; value: ResourceScope } | { ok: false; error: string } {
  const parsed = validateCurriculumScope({
    country: typeof input.country === 'string' ? input.country : '',
    state: typeof input.state === 'string' ? input.state : '',
    city: typeof input.city === 'string' ? input.city : '',
  })
  if (parsed.ok === false) {
    const message = parsed.field === 'country' ? 'Ülke seçimi zorunludur.'
      : parsed.field === 'state' ? 'Şehir girildiyse eyalet/il de seçilmelidir.' : 'Şehir/ilçe adı geçersiz.'
    return { ok: false, error: message }
  }
  const { country, state, city } = parsed.value
  return { ok: true, value: { country, state: state || null, city: city || null } }
}

/** Kullanıcı konumu; ülkesi yoksa Türkiye. */
export function userScopeOrDefault(user: ScopeLike | null | undefined): ScopeLike {
  return hasLocation(user) ? { country: user!.country, state: user!.state, city: user!.city } : { country: DEFAULT_COUNTRY }
}

/** Kaydın kapsamı boşsa (eski satır) Türkiye sayılır. */
export function rowScope(row: ScopeLike | null | undefined): ScopeLike {
  return { country: row?.country || DEFAULT_COUNTRY, state: row?.state, city: row?.city }
}

/** Yalnızca kapsamı kullanıcının konumuna uyan kayıtları bırakır. */
export function filterRowsByUserScope<T>(rows: T[], user: ScopeLike | null | undefined, scopeOf: (row: T) => ScopeLike | null | undefined): T[] {
  const viewer = userScopeOrDefault(user)
  return rows.filter(row => scopeApplies(rowScope(scopeOf(row)), viewer))
}
