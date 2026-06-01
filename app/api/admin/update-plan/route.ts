// app/api/admin/update-plan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  // Admin kontrolü — anon key ile
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId, plan, months } = await req.json()
  if (!userId || !plan) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  // Service role ile güncelle — RLS bypass
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const expires = plan === 'premium' && months
    ? new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()
    : null

  const updateData: any = { plan, plan_expires_at: expires }
  if (plan === 'free') updateData.monthly_test_count = 0

  const { error } = await adminClient
    .from('profiles')
    .update(updateData)
    .eq('id', userId)

  if (error) {
    console.error('[admin/update-plan] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log(`[admin/update-plan] userId=${userId} plan=${plan} months=${months} expires=${expires}`)
  return NextResponse.json({ success: true, plan, expires })
}
