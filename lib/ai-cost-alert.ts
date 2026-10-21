// Günlük AI maliyeti ve kullanıcı başına çağrı sayısı için anormal kullanım uyarıları.
// Saf hesaplama: `evaluateAiUsage` satırları ve eşikleri alır, uyarı listesi döner (cron rotası bildirim yazar).
export interface AiUsageRow {
  created_at: string
  provider: string | null
  cost_usd: number | string | null
  user_id: string | null
}

export interface AiCostAlertConfig {
  dailyLimitUsd: number       // son 24 saat toplam maliyet bu değeri aşarsa uyar
  spikeFactor: number         // son 24 saat, önceki 7 günlük ortalamanın bu katını aşarsa uyar
  spikeMinUsd: number         // ...ve en az bu kadar (küçük tutarlardaki oynamalar uyarı üretmesin)
  perUserCallsLimit: number   // tek kullanıcı son 24 saatte bu kadar AI çağrısı yaparsa uyar
}

// Varsayılanlar 1–21 Ekim 2026 gerçek kullanımına göre: normal gün 0,02–2,83 $, tek günlük zirve 11,63 $,
// kullanıcı başına en çok ~300 çağrı (yönetici testi).
export const DEFAULT_AI_COST_ALERT_CONFIG: AiCostAlertConfig = { dailyLimitUsd: 5, spikeFactor: 3, spikeMinUsd: 1, perUserCallsLimit: 400 }

export interface AiCostAlert { key: string; title: string; body: string }

const DAY_MS = 86_400_000

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function aiCostAlertConfigFromEnv(env: Record<string, string | undefined> = process.env): AiCostAlertConfig {
  return {
    ...DEFAULT_AI_COST_ALERT_CONFIG,
    dailyLimitUsd: positive(env.AI_DAILY_COST_ALERT_USD, DEFAULT_AI_COST_ALERT_CONFIG.dailyLimitUsd),
    perUserCallsLimit: positive(env.AI_USER_DAILY_CALLS_ALERT, DEFAULT_AI_COST_ALERT_CONFIG.perUserCallsLimit),
  }
}

export function evaluateAiUsage(rows: AiUsageRow[], now: Date, config: AiCostAlertConfig = DEFAULT_AI_COST_ALERT_CONFIG): { last24hUsd: number; baselineDailyUsd: number; alerts: AiCostAlert[] } {
  const end = now.getTime()
  const dayStart = end - DAY_MS
  const baselineStart = dayStart - 7 * DAY_MS
  let last24hUsd = 0
  let baselineUsd = 0
  const callsByUser = new Map<string, number>()
  const costByProvider = new Map<string, number>()
  for (const row of rows) {
    const time = new Date(row.created_at).getTime()
    if (!Number.isFinite(time) || time > end || time < baselineStart) continue
    const cost = Number(row.cost_usd)
    const usd = Number.isFinite(cost) && cost > 0 ? cost : 0
    if (time >= dayStart) {
      last24hUsd += usd
      const provider = row.provider || 'bilinmiyor'
      costByProvider.set(provider, (costByProvider.get(provider) ?? 0) + usd)
      if (row.user_id) callsByUser.set(row.user_id, (callsByUser.get(row.user_id) ?? 0) + 1)
    } else {
      baselineUsd += usd
    }
  }
  const baselineDailyUsd = baselineUsd / 7
  const alerts: AiCostAlert[] = []
  const byProvider = [...costByProvider.entries()].sort((a, b) => b[1] - a[1]).map(([provider, usd]) => `${provider} ${usd.toFixed(2)} $`).join(', ')
  if (last24hUsd >= config.dailyLimitUsd) {
    alerts.push({ key: 'daily_limit', title: '⚠️ AI maliyet uyarısı', body: `Son 24 saatte AI maliyeti ${last24hUsd.toFixed(2)} $ (eşik ${config.dailyLimitUsd} $). Dağılım: ${byProvider || '-'}.` })
  }
  if (baselineDailyUsd > 0 && last24hUsd >= config.spikeMinUsd && last24hUsd > config.spikeFactor * baselineDailyUsd) {
    alerts.push({ key: 'spike', title: '⚠️ AI maliyet sıçraması', body: `Son 24 saatteki maliyet (${last24hUsd.toFixed(2)} $), önceki 7 günlük günlük ortalamanın (${baselineDailyUsd.toFixed(2)} $) ${(last24hUsd / baselineDailyUsd).toFixed(1)} katı.` })
  }
  for (const [userId, calls] of callsByUser) {
    if (calls >= config.perUserCallsLimit) {
      alerts.push({ key: `user_calls:${userId.slice(0, 8)}`, title: '⚠️ Yoğun AI kullanımı', body: `Kullanıcı ${userId.slice(0, 8)}… son 24 saatte ${calls} AI çağrısı yaptı (eşik ${config.perUserCallsLimit}).` })
    }
  }
  return { last24hUsd, baselineDailyUsd, alerts }
}
