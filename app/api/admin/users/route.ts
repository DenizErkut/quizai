import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

export async function GET() {
  // Admin kontrolü — normal anon key ile
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

  // Service role ile tüm kullanıcıları çek
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await adminClient
    .from('profiles')
    .select('id, grade, plan, plan_expires_at, monthly_test_count, is_admin, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // İsimler TR-PG'den toplu çekilir ve listeye eklenir
  const identities = await getIdentitiesBySupabaseIds((data ?? []).map((u: any) => u.id))
  const withNames = (data ?? []).map((u: any) => ({ ...u, name: identities[u.id]?.full_name ?? null }))

  return NextResponse.json(withNames)
}
