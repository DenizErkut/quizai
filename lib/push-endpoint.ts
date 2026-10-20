// Web-push aboneliklerinin güvenli biçimde kabulü: sunucu `endpoint` adresine POST ettiği için (kör SSRF)
// yalnızca bilinen tarayıcı push servislerinin https adresleri kabul edilir.
export interface PushSubscriptionLike {
  endpoint: string
  keys: { p256dh: string; auth: string }
  expirationTime?: number | null
}

const HOST_PATTERNS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
]

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false
  let url: URL
  try { url = new URL(endpoint) } catch { return false }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false
  return HOST_PATTERNS.some(pattern => pattern.test(url.hostname))
}

export function parsePushSubscription(value: unknown): PushSubscriptionLike | null {
  let candidate = value
  if (typeof candidate === 'string') {
    if (candidate.length > 4096) return null
    try { candidate = JSON.parse(candidate) } catch { return null }
  }
  if (!candidate || typeof candidate !== 'object') return null
  const sub = candidate as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; expirationTime?: unknown }
  if (!isAllowedPushEndpoint(sub.endpoint)) return null
  const p256dh = sub.keys?.p256dh, auth = sub.keys?.auth
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || p256dh.length > 256 || auth.length > 128) return null
  return { endpoint: sub.endpoint, keys: { p256dh, auth }, expirationTime: typeof sub.expirationTime === 'number' ? sub.expirationTime : null }
}
