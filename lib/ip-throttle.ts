// Oturumsuz uçlar için IP başına kaba hız sınırı (kod/ad tarama koruması).
// UYARI: sunucusuz ortamda bellek her örnekte ayrıdır; bu yalnızca "en iyi çaba" bir sınırlayıcıdır.
// Kalıcı koruma için Vercel Firewall/WAF hız sınırı kuralı da tanımlanmalıdır.
const hits = new Map<string, number[]>()

export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

/** true = istek izinli; false = sınır aşıldı. */
export function allowByIp(request: Request, bucket: string, max = 30, windowMs = 60_000, now = Date.now()): boolean {
  const key = `${bucket}:${clientIp(request)}`
  const recent = (hits.get(key) ?? []).filter(time => now - time < windowMs)
  if (recent.length >= max) { hits.set(key, recent); return false }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const [k, times] of hits) if (!times.some(time => now - time < windowMs)) hits.delete(k)
  return true
}
