import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return profile?.is_admin ? user : null
}

export async function GET() {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data, error } = await adminDb.from('curriculum_versions').select('*')
    .order('academic_year_start', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ versions: data || [] })
}

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const yearStart = Number(body?.yearStart)
  if (!body?.code || !body?.title || !Number.isInteger(yearStart) || !body?.effectiveFrom || !body?.effectiveTo) {
    return NextResponse.json({ error: 'Kod, başlık, öğretim yılı ve geçerlilik tarihleri gerekli.' }, { status: 400 })
  }
  const { data, error } = await adminDb.rpc('create_curriculum_version_v1', {
    p_code: String(body.code), p_title: String(body.title), p_authority: String(body.authority || 'MEB'),
    p_year_start: yearStart, p_effective_from: String(body.effectiveFrom), p_effective_to: String(body.effectiveTo),
    p_source_reference: typeof body.sourceReference === 'string' ? body.sourceReference : null,
    p_actor_id: user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, versionId: data })
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (body?.action !== 'activate' || typeof body?.versionId !== 'string') {
    return NextResponse.json({ error: 'Geçerli versionId ve action gerekli.' }, { status: 400 })
  }
  const { data, error } = await adminDb.rpc('activate_curriculum_version_v1', {
    p_version_id: body.versionId, p_actor_id: user.id,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true, result: data })
}
