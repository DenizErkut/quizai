import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchAllRows } from '@/lib/paginate'
import { computeCurriculumCoverage, type CatalogObjective, type CurriculumRow } from '@/lib/curriculum-coverage'

export const runtime = 'nodejs'
export const maxDuration = 60

const adminDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function isAdmin(): Promise<boolean> {
  const cookieStore = await cookies()
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: name => cookieStore.get(name)?.value } })
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return false
  const { data } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true
}

/** Per curriculum row: how many catalog objectives match, how many topics they provide, and why a row has none. */
export async function GET() {
  if (!await isAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const [curriculum, objectives] = await Promise.all([
      fetchAllRows<CurriculumRow>((from, to) => adminDb.from('curriculum').select('id,level,grade,subject,topics').order('id').range(from, to)),
      fetchAllRows<CatalogObjective>((from, to) => adminDb.from('learning_objective_catalog')
        .select('grade,subject,topic,unit,is_active,verification_status,lifecycle_status').order('id').range(from, to)),
    ])
    return NextResponse.json({ generatedAt: new Date().toISOString(), ...computeCurriculumCoverage(curriculum, objectives) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kapsam raporu üretilemedi.' }, { status: 500 })
  }
}
