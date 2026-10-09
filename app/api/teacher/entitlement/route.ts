import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { resolveTeacherEntitlement } from '@/lib/teacher-access'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const dynamic = 'force-dynamic'

// The teacher's membership state: tier, invite progress towards the free Altın year and free-tier usage.
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const entitlement = await resolveTeacherEntitlement(user.id)
  if (!entitlement) return NextResponse.json({ error: 'Onaylı öğretmen hesabı gerekir.' }, { status: 403 })
  return NextResponse.json({ entitlement }, { headers: { 'Cache-Control': 'private, no-store' } })
}
