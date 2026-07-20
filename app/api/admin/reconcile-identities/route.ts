// app/api/admin/reconcile-identities/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { reconcileIdentities } from '@/lib/identity/reconcile'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single()
  return profile?.is_admin ? user : null
}

// GET — sadece tarama (kaç kayıt eksik, hiçbir şey yazmaz)
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  try {
    const result = await reconcileIdentities({ dryRun: true })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Tarama başarısız.' }, { status: 500 })
  }
}

// POST — tara + eksikleri otomatik düzelt
export async function POST() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  try {
    const result = await reconcileIdentities({ dryRun: false })
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Düzeltme başarısız.' }, { status: 500 })
  }
}
