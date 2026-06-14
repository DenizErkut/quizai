// app/api/ab/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Kullanıcıyı varyanta ata (deterministik — aynı user her zaman aynı varyanta düşer)
function assignVariant(variants: any[], userId: string, testName: string): string {
  // Hash: userId + testName → 0-99 arası sayı
  let hash = 0
  const str = userId + testName
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  const bucket = Math.abs(hash) % 100

  let cumulative = 0
  for (const v of variants) {
    cumulative += v.weight
    if (bucket < cumulative) return v.id
  }
  return variants[0].id
}

// GET: Kullanıcının varyantını al
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const testName = searchParams.get('test')
  if (!testName) return NextResponse.json({ error: 'test parametresi gerekli' }, { status: 400 })

  // Auth — opsiyonel
  let userId: string | null = null
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
    userId = user?.id || null
  }

  const sessionId = searchParams.get('session_id') || req.headers.get('x-session-id')

  // Testi bul
  const { data: test } = await supabase
    .from('ab_tests')
    .select('*')
    .eq('name', testName)
    .eq('active', true)
    .single()

  if (!test) return NextResponse.json({ variant: 'control' }) // Test yoksa control

  // Mevcut atama var mı?
  if (userId) {
    const { data: existing } = await supabase
      .from('ab_assignments')
      .select('variant_id')
      .eq('user_id', userId)
      .eq('test_id', test.id)
      .single()
    if (existing) return NextResponse.json({ variant: existing.variant_id, test_id: test.id })
  }

  // Yeni atama yap
  const variantId = assignVariant(test.variants, userId || sessionId || 'anon', testName)

  if (userId) {
    await supabase.from('ab_assignments').upsert({
      user_id: userId, test_id: test.id, variant_id: variantId
    }, { onConflict: 'user_id,test_id' })
  } else if (sessionId) {
    await supabase.from('ab_assignments').upsert({
      session_id: sessionId, test_id: test.id, variant_id: variantId
    }, { onConflict: 'session_id,test_id' })
  }

  return NextResponse.json({ variant: variantId, test_id: test.id })
}

// POST: Event kaydet
export async function POST(req: NextRequest) {
  const { test_name, variant_id, event_type, metadata } = await req.json()
  if (!test_name || !variant_id || !event_type) {
    return NextResponse.json({ error: 'Eksik parametre' }, { status: 400 })
  }

  let userId: string | null = null
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
    userId = user?.id || null
  }

  const { data: test } = await supabase
    .from('ab_tests').select('id').eq('name', test_name).single()
  if (!test) return NextResponse.json({ error: 'Test bulunamadı' }, { status: 404 })

  await supabase.from('ab_events').insert({
    user_id: userId,
    test_id: test.id,
    variant_id,
    event_type,
    metadata: metadata || null,
  })

  return NextResponse.json({ success: true })
}

// GET /api/ab/results — Admin: test sonuçları
export async function PATCH(req: NextRequest) {
  // Admin kontrolü
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  // Tüm testler + sonuçlar
  const { data: tests } = await supabase.from('ab_tests').select('*').order('created_at', { ascending: false })

  const results = await Promise.all((tests || []).map(async (test: any) => {
    const { data: events } = await supabase
      .from('ab_events')
      .select('variant_id, event_type')
      .eq('test_id', test.id)

    const { data: assignments } = await supabase
      .from('ab_assignments')
      .select('variant_id')
      .eq('test_id', test.id)

    const variantStats: Record<string, { assignments: number; views: number; conversions: number; clicks: number }> = {}
    for (const v of test.variants) {
      variantStats[v.id] = { assignments: 0, views: 0, conversions: 0, clicks: 0 }
    }

    for (const a of assignments || []) {
      if (variantStats[a.variant_id]) variantStats[a.variant_id].assignments++
    }
    for (const e of events || []) {
      if (!variantStats[e.variant_id]) continue
      if (e.event_type === 'view') variantStats[e.variant_id].views++
      if (e.event_type === 'conversion') variantStats[e.variant_id].conversions++
      if (e.event_type === 'click') variantStats[e.variant_id].clicks++
    }

    // Conversion rate ve uplift hesapla
    const variantResults = test.variants.map((v: any) => {
      const s = variantStats[v.id]
      const convRate = s.views > 0 ? (s.conversions / s.views * 100).toFixed(1) : '0'
      return { ...v, ...s, convRate: parseFloat(convRate) }
    })

    const control = variantResults.find((v: any) => v.id === 'control')
    const treatment = variantResults.find((v: any) => v.id === 'treatment')
    const uplift = control && treatment && control.convRate > 0
      ? (((treatment.convRate - control.convRate) / control.convRate) * 100).toFixed(1)
      : null

    return { ...test, variantResults, uplift }
  }))

  return NextResponse.json({ tests: results })
}
