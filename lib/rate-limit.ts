// lib/rate-limit.ts
// Supabase tabanlı basit rate limiter — Upstash gerektirmez
// API başına kullanıcı günlük limit kontrolü

import { createClient } from '@/lib/supabase/server-create-client'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RateLimitConfig {
  endpoint: string
  limit: number      // günlük max istek
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: string
  unavailable?: boolean
}

export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    const { data, error } = await adminDb.rpc('consume_daily_api_rate_limit_v1', {
      p_user_id: userId, p_endpoint: config.endpoint, p_limit: config.limit,
    })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row || typeof row.allowed !== 'boolean') throw new Error('Rate limit could not be verified')
    return { allowed: row.allowed, remaining: row.remaining, resetAt: row.reset_at }
  } catch (error) {
    // Never permit unmetered paid calls or unlimited invitation guessing.
    console.error('[rate-limit] verification unavailable', error instanceof Error ? error.message : 'unknown')
    return { allowed: false, remaining: 0, resetAt: new Date(Date.now() + 60000).toISOString(), unavailable: true }
  }
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
    JSON.stringify({ error: result.unavailable ? 'İstek sınırı doğrulanamadı. Bir dakika sonra yeniden deneyin.' : 'Günlük limit aşıldı. Yarın tekrar dene.' }),
    {
      status: result.unavailable ? 503 : 429,
      headers: {
        'Content-Type': 'application/json',
        ...rateLimitHeaders(result),
        'Retry-After': Math.ceil((new Date(result.resetAt).getTime() - Date.now()) / 1000).toString(),
      }
    }
  )
}
