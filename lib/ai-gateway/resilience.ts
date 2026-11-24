// Ortak dayanıklılık yardımcıları (AI altyapı planı P1-6): sınırlı yeniden deneme + devre kesici. Bağımlılıksız, saat enjekte edilebilir.
// Vercel sunucusuz ortamda durum örnek (instance) ömürlüdür; bu yüzden kesici "kısa süreli koruma"dır, kalıcı sağlık kararı değildir.

export interface RetryOptions {
  retries?: number            // ek deneme sayısı (varsayılan 1)
  baseDelayMs?: number        // ilk bekleme (varsayılan 250)
  maxDelayMs?: number         // üst sınır (varsayılan 2000)
  isRetryable?: (error: unknown) => boolean
  sleep?: (ms: number) => Promise<void>
  random?: () => number
}

/** Ağ hatası, zaman aşımı, 429 ve 5xx yeniden denenir; 4xx (429 hariç) ve doğrulama hataları denenmez. */
export function isTransientError(error: unknown): boolean {
  const e = error as { name?: string; status?: number; code?: string } | null
  if (!e) return false
  if (typeof e.status === 'number') return e.status === 429 || e.status >= 500
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return true
  return e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' || e.code === 'ECONNREFUSED' || e.name === 'TypeError' // fetch ağ hatası
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = Math.max(0, options.retries ?? 1)
  const base = options.baseDelayMs ?? 250
  const max = options.maxDelayMs ?? 2000
  const retryable = options.isRetryable ?? isTransientError
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)))
  const random = options.random ?? Math.random
  for (let attempt = 0; ; attempt++) {
    try { return await fn(attempt) } catch (error) {
      if (attempt >= retries || !retryable(error) || error instanceof CircuitOpenError) throw error
      const delay = Math.min(max, base * 2 ** attempt) * (0.5 + random() / 2) // jitter
      await sleep(delay)
    }
  }
}

export class CircuitOpenError extends Error {
  constructor(public readonly key: string) { super(`CIRCUIT_OPEN:${key}`); this.name = 'CircuitOpenError' }
}

export interface BreakerOptions {
  failureThreshold?: number   // ardışık hata sayısı (varsayılan 5)
  openMs?: number             // açık kalma süresi (varsayılan 30 sn)
  now?: () => number
}

type State = { failures: number; openedAt: number | null; probing: boolean }

export class CircuitBreaker {
  private readonly states = new Map<string, State>()
  private readonly threshold: number
  private readonly openMs: number
  private readonly now: () => number
  constructor(options: BreakerOptions = {}) {
    this.threshold = options.failureThreshold ?? 5
    this.openMs = options.openMs ?? 30_000
    this.now = options.now ?? Date.now
  }
  private state(key: string): State {
    let s = this.states.get(key)
    if (!s) { s = { failures: 0, openedAt: null, probing: false }; this.states.set(key, s) }
    return s
  }
  status(key: string): 'closed' | 'open' | 'half-open' {
    const s = this.state(key)
    if (s.openedAt === null) return 'closed'
    return this.now() - s.openedAt >= this.openMs ? 'half-open' : 'open'
  }
  async run<T>(key: string, fn: () => Promise<T>, countsAsFailure: (error: unknown) => boolean = isTransientError): Promise<T> {
    const s = this.state(key)
    const status = this.status(key)
    if (status === 'open' || (status === 'half-open' && s.probing)) throw new CircuitOpenError(key)
    if (status === 'half-open') s.probing = true
    try {
      const result = await fn()
      s.failures = 0; s.openedAt = null; s.probing = false
      return result
    } catch (error) {
      if (countsAsFailure(error)) {
        s.failures++
        if (s.failures >= this.threshold || status === 'half-open') s.openedAt = this.now()
      }
      s.probing = false
      throw error
    }
  }
}

/** Retry + kesici birlikte: açık kesici ücretli çağrı yapmadan hemen CircuitOpenError fırlatır. */
export function withResilience<T>(breaker: CircuitBreaker, key: string, fn: () => Promise<T>, retry: RetryOptions = {}): Promise<T> {
  return withRetry(() => breaker.run(key, fn), retry)
}
