// Giriş/kayıt sonrası yönlendirme hedefi ("next") için ortak doğrulama.
// Yalnızca aynı site içindeki yollar kabul edilir. `//host`, `/\host`, kontrol karakterleri ve
// URL ayrıştırıcısının başka bir kökene çevirdiği her değer reddedilir (açık yönlendirme koruması).
const BASE = 'https://safe-next.invalid'

export function safeNextPath(value: string | null | undefined, options: { allowLogin?: boolean } = {}): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // Ters eğik çizgi ve kontrol karakterleri tarayıcılarda "/" gibi davranabilir.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null
  if (!options.allowLogin && value.startsWith('/login')) return null
  try {
    const url = new URL(value, BASE)
    if (url.origin !== BASE) return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}
