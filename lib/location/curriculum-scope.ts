// Müfredat sürümü/satırı konum kapsamı ile kullanıcının konumunu eşleştirir.
// Kapsam: ülke zorunlu; eyalet/şehir boşsa ülke geneli geçerlidir.
export interface ScopeLike { country?: string | null; state?: string | null; city?: string | null }

function norm(value: string | null | undefined): string {
  // Büyük/küçük harf ve Türkçe nokta farkları (I/İ/ı/i) yer adı eşleşmesini bozmasın.
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Kullanıcı konumu boş ülke ile müfredata erişemez (konum zorunlu). */
export function hasLocation(user: ScopeLike | null | undefined): boolean {
  return Boolean(user?.country && user.country.trim())
}

/** Kapsamın daha dar olması = daha özel: şehir 3, eyalet 2, ülke 1. */
export function scopeSpecificity(scope: ScopeLike): number {
  return scope.city ? 3 : scope.state ? 2 : 1
}

export function scopeApplies(scope: ScopeLike, user: ScopeLike): boolean {
  if (!hasLocation(user) || !scope.country) return false
  if (norm(scope.country) !== norm(user.country)) return false
  if (scope.state && norm(scope.state) !== norm(user.state)) return false
  if (scope.city && norm(scope.city) !== norm(user.city)) return false
  return true
}

/** Kullanıcıya uygulanan müfredatlar; birden çoğu uyuyorsa yalnızca en özel kapsam kalır. */
export function applicableScopes<T extends ScopeLike>(items: T[], user: ScopeLike): T[] {
  const matching = items.filter(item => scopeApplies(item, user))
  if (!matching.length) return []
  const top = Math.max(...matching.map(scopeSpecificity))
  return matching.filter(item => scopeSpecificity(item) === top)
}
