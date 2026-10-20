// Vercel Cron ve zamanlanmış çağrılar için ortak kimlik denetimi.
// CRON_SECRET tanımlı değilse HER ZAMAN reddeder (eski kalıp `Bearer undefined` kabul ediyordu) ve
// karşılaştırmayı sabit zamanlı yapar.
import { createHash, timingSafeEqual } from 'node:crypto'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function isCronAuthorized(request: Request, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret) return false
  const header = request.headers.get('authorization') || ''
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`))
}
