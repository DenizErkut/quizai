import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminDb
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return profile?.is_admin ? user : null
}

export async function GET() {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await adminDb.from('learning_objective_import_batches')
    .select('id,source_type,source_reference,status,total_count,valid_count,invalid_count,created_at')
    .order('created_at', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ batches: data || [] })
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const sourceType = body?.sourceType
  const sourceReference = typeof body?.sourceReference === 'string' ? body.sourceReference.trim() : ''
  const rows = body?.rows
  if (!['meb', 'manual', 'import'].includes(sourceType) || sourceReference.length < 3 || !Array.isArray(rows)) {
    return NextResponse.json({ error: 'Geçerli kaynak türü, kaynak referansı ve JSON satırları gerekli.' }, { status: 400 })
  }
  if (rows.length < 1 || rows.length > 500) {
    return NextResponse.json({ error: 'Bir parti 1–500 kazanım içermelidir.' }, { status: 400 })
  }

  const { data, error } = await adminDb.rpc('stage_learning_objective_import', {
    p_source_type: sourceType,
    p_source_reference: sourceReference,
    p_created_by: user.id,
    p_rows: rows,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, result: data })
}
