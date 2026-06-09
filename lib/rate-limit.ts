// lib/rate-limit.ts
// Supabase tabanlı basit rate limiter — Upstash gerektirmez
// API başına kullanıcı günlük limit kontrolü

import { createClient } from '@supabase/supabase-js'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RateLimitConfig {
  endpoint: string
  limit: number      // günlük max istek
  windowHours?: number // default 24 saat
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: string
}

export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const { endpoint, limit, windowHours = 24 } = config
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowHours * 60 * 60 * 1000)
  const today = now.toISOString().split('T')[0]

  try {
    // Mevcut kaydı getir
    const { data: existing } = await adminDb
      .from('api_rate_limits')
      .select('id, count, window_date')
      .eq('user_id', userId)
      .eq('endpoint', endpoint)
      .eq('window_date', today)
      .maybeSingle()

    if (!existing) {
      // İlk istek — kayıt oluştur
      await adminDb.from('api_rate_limits').insert({
        user_id: userId,
        endpoint,
        count: 1,
        window_date: today,
      })
      return { allowed: true, remaining: limit - 1, resetAt: getResetTime() }
    }

    if (existing.count >= limit) {
      return { allowed: false, remaining: 0, resetAt: getResetTime() }
    }

    // Sayacı artır
    await adminDb.from('api_rate_limits')
      .update({ count: existing.count + 1 })
      .eq('id', existing.id)

    return {
      allowed: true,
      remaining: limit - existing.count - 1,
      resetAt: getResetTime()
    }
  } catch {
    // Rate limit kontrolü başarısız olursa izin ver (graceful degradation)
    return { allowed: true, remaining: limit, resetAt: getResetTime() }
  }
}

function getResetTime(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow.toISOString()
}

// Response header'larına rate limit bilgisi ekle
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetAt,
  }
}

// Limit aşıldığında response
export function rateLimitExceeded(result: RateLimitResult) {
  return new Response(
    JSON.stringify({ error: 'Günlük limit aşıldı. Yarın tekrar dene.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...rateLimitHeaders(result),
        'Retry-After': Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000).toString(),
      }
    }
  )
}
