// app/api/institution/check-admin/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ isAdmin: false })
  }
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ isAdmin: false })

  // service_role ile kontrol et
  const { data: instUser } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id, institutions(name)')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  return NextResponse.json({
    isAdmin: !!instUser,
    institution: instUser?.institutions ?? null,
  })
}
