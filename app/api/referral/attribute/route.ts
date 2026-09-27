import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any
  const { data: { user }, error: authError } = await authClient.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  let body: { referral_code?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  const code = typeof body.referral_code === 'string' ? body.referral_code.trim().toUpperCase() : ''
  if (!code || code.length > 64) return NextResponse.json({ error: 'Geçersiz davet kodu.' }, { status: 400 })

  const { data: referrer, error: lookupError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('referral_code', code)
    .maybeSingle()
  if (lookupError) {
    console.error('[referral/attribute] referrer lookup failed:', lookupError.message)
    return NextResponse.json({ error: 'Davet kodu doğrulanamadı.' }, { status: 500 })
  }
  if (!referrer) return NextResponse.json({ error: 'Davet kodu bulunamadı.' }, { status: 404 })
  if (referrer.id === user.id) return NextResponse.json({ error: 'Kendi davet kodunu kullanamazsın.' }, { status: 400 })

  const { error: insertError } = await supabaseAdmin
    .from('referrals')
    .insert({ referrer_id: referrer.id, referred_id: user.id })

  if (insertError && insertError.code !== '23505') {
    console.error('[referral/attribute] attribution insert failed:', insertError.message)
    return NextResponse.json({ error: 'Davet ilişkilendirilemedi.' }, { status: 500 })
  }

  return NextResponse.json({
    attributed: !insertError,
    rewardRequiresPaidSubscription: true,
  })
}
