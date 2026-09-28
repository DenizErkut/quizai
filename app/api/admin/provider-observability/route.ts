import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString()
  const { data, error } = await db.from('ai_usage_logs').select('provider,model,operation,input_tokens,output_tokens,cost_usd,duration_ms,pricing_version,meta,created_at').gte('created_at', since).limit(30000)
  if (error) return NextResponse.json({ error: 'Sağlayıcı ölçümleri alınamadı.' }, { status: 500 })
  type Bucket = { provider:string; calls:number; inputTokens:number; outputTokens:number; costUsd:number; durations:number[]; priced:number; successEvidence:number; failureEvidence:number; models:Set<string>; operations:Map<string,number> }
  const map = new Map<string, Bucket>()
  const routerShadow = new Map<string, { servedEngine: string; recommendedEngine: string; reason: string; calls: number }>()
  for (const row of data ?? []) {
    const provider = row.provider || 'unknown'
    const b = map.get(provider) ?? { provider, calls:0, inputTokens:0, outputTokens:0, costUsd:0, durations:[], priced:0, successEvidence:0, failureEvidence:0, models:new Set(), operations:new Map() }
    b.calls++; b.inputTokens += Number(row.input_tokens || 0); b.outputTokens += Number(row.output_tokens || 0); b.costUsd += Number(row.cost_usd || 0)
    if (Number.isFinite(Number(row.duration_ms))) b.durations.push(Number(row.duration_ms))
    if (row.pricing_version && row.pricing_version !== 'unknown') b.priced++
    if (row.model) b.models.add(row.model)
    b.operations.set(row.operation, (b.operations.get(row.operation) ?? 0) + 1)
    const meta = (row.meta ?? {}) as Record<string, unknown>
    if (meta.routingPolicyVersion === 'measured-router-v1' && meta.routingMode === 'shadow') {
      const servedEngine = String(meta.routerServedEngine || 'unknown')
      const recommendedEngine = String(meta.routerRecommendedEngine || servedEngine)
      const reason = String(meta.routingReason || 'unknown')
      const key = `${servedEngine}|${recommendedEngine}|${reason}`
      const entry = routerShadow.get(key) ?? { servedEngine, recommendedEngine, reason, calls: 0 }
      entry.calls++
      routerShadow.set(key, entry)
    }
    const outcome = String(meta.outcome ?? '').toLowerCase(); const hasStatus = meta.status !== undefined && meta.status !== null; const status = hasStatus ? Number(meta.status) : Number.NaN
    const failed = outcome.includes('error') || outcome.includes('fail') || (Number.isFinite(status) && status >= 400)
    const evidenced = Boolean(outcome) || (hasStatus && Number.isFinite(status))
    if (failed) b.failureEvidence++; else if (evidenced) b.successEvidence++
    map.set(provider, b)
  }
  const providers = [...map.values()].map(b => {
    b.durations.sort((a,c)=>a-c); const qualitySample = b.successEvidence + b.failureEvidence
    return { provider:b.provider, calls:b.calls, models:[...b.models], inputTokens:b.inputTokens, outputTokens:b.outputTokens, costUsd:Number(b.costUsd.toFixed(6)), costPerCallUsd:b.calls?Number((b.costUsd/b.calls).toFixed(6)):null, p95DurationMs:b.durations.length?b.durations[Math.min(b.durations.length-1,Math.floor(b.durations.length*.95))]:null, pricingCoverage:b.calls?b.priced/b.calls:null, observedSuccessRate:qualitySample?b.successEvidence/qualitySample:null, qualitySample, topOperations:[...b.operations.entries()].sort((a,c)=>c[1]-a[1]).slice(0,5).map(([operation,calls])=>({operation,calls})) }
  }).sort((a,b)=>b.costUsd-a.costUsd)
  const totalCost = providers.reduce((n,p)=>n+p.costUsd,0)
  return NextResponse.json({ periodDays:30, generatedAt:new Date().toISOString(), totals:{calls:providers.reduce((n,p)=>n+p.calls,0),costUsd:Number(totalCost.toFixed(6)),inputTokens:providers.reduce((n,p)=>n+p.inputTokens,0),outputTokens:providers.reduce((n,p)=>n+p.outputTokens,0)}, providers, routerShadow: [...routerShadow.values()], note:'Maliyet ai_usage_logs içindeki gerçekleşen token kayıtlarından hesaplanır. Gözlenen başarı oranı yalnız sonuç meta verisi bulunan çağrıları kapsar ve teknik çağrı başarısını gösterir; içerik doğruluğu/pedagojik kalite metriği değildir. Router gölge önerileri canlı sağlayıcı seçimini değiştirmez.' })
}
