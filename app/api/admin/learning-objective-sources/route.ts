import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchAllRows } from '@/lib/paginate'

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

const PAGE_SIZE = 50
type VersionRow = { id: string; code: string; title: string; status: string; authority: string; country: string | null; state: string | null; city: string | null }
type FacetRow = { grade: string; subject: string }
const gradeNumber = (value: string) => value.match(/\d+/)?.[0] || ''
const escapeLike = (value: string) => value.replace(/[\\%_,()*]/g, ' ').trim()
const same = (a: string | null | undefined, b: string) => (a || '').trim().toLocaleLowerCase('tr-TR') === b.trim().toLocaleLowerCase('tr-TR')
const distinct = (values: Array<string | null>) => [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))].sort((a, b) => a.localeCompare(b, 'tr'))

// Kazanım kaynaklarını (müfredat sürümü + kazanım kataloğu) ülke/eyalet/şehir, sınıf ve derse göre listeler (yalnızca yönetici).
export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const params = req.nextUrl.searchParams
  const country = (params.get('country') || '').trim().toUpperCase()
  const state = (params.get('state') || '').trim()
  const city = (params.get('city') || '').trim()
  const grade = gradeNumber(params.get('grade') || '')
  const subject = (params.get('subject') || '').trim()
  const search = escapeLike((params.get('q') || '').slice(0, 100))
  const page = Math.max(1, Number(params.get('page') || 1))
  const from = (page - 1) * PAGE_SIZE

  const versionsResult = await adminDb.from('curriculum_versions')
    .select('id,code,title,status,authority,country,state,city').order('country').order('code')
  if (versionsResult.error) return NextResponse.json({ error: versionsResult.error.message }, { status: 500 })
  const allVersions = (versionsResult.data || []) as VersionRow[]

  // Konum süzgeci: ülke seçilince o ülkenin tüm sürümleri; eyalet/şehir seçilince yalnızca tam o kapsamdaki sürümler.
  const scoped = allVersions.filter(version =>
    (!country || version.country === country)
    && (!state || same(version.state, state))
    && (!city || same(version.city, city)))
  const versionIds = scoped.map(version => version.id)
  const countryOptions = distinct(allVersions.map(version => version.country))
  const stateOptions = country ? distinct(allVersions.filter(version => version.country === country).map(version => version.state)) : []
  const cityOptions = country && state
    ? distinct(allVersions.filter(version => version.country === country && same(version.state, state)).map(version => version.city))
    : []
  const facets = { countries: countryOptions, states: stateOptions, cities: cityOptions }
  if (!versionIds.length) return NextResponse.json({ objectives: [], total: 0, catalogTotal: 0, filters: [], versions: scoped, facets })

  let query = adminDb.from('learning_objective_catalog')
    .select('id,objective_code,title,level,grade,subject,unit,topic,verification_status,lifecycle_status,is_active,curriculum_version_id,source_type,source_reference', { count: 'exact' })
    .in('curriculum_version_id', versionIds)
  if (grade) query = query.ilike('grade', `${grade}. s*`)
  if (subject) query = query.eq('subject', subject)
  if (search) query = query.or(`objective_code.ilike.*${search}*,title.ilike.*${search}*,unit.ilike.*${search}*,topic.ilike.*${search}*`)

  let listResult, facetRows
  try {
    [listResult, facetRows] = await Promise.all([
      query.order('subject').order('grade').order('objective_code').range(from, from + PAGE_SIZE - 1),
      fetchAllRows<FacetRow>((a, b) => adminDb.from('learning_objective_catalog').select('id,grade,subject')
        .in('curriculum_version_id', versionIds).order('id').range(a, b)),
    ])
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Kazanımlar okunamadı.' }, { status: 500 })
  }
  if (listResult.error) return NextResponse.json({ error: listResult.error.message }, { status: 500 })

  const byGrade = new Map<string, Set<string>>()
  for (const row of facetRows) {
    const key = gradeNumber(row.grade)
    if (!key || !row.subject) continue
    if (!byGrade.has(key)) byGrade.set(key, new Set())
    byGrade.get(key)!.add(row.subject)
  }
  const filters = [...byGrade.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([gradeKey, subjects]) => ({ grade: gradeKey, subjects: [...subjects].sort((a, b) => a.localeCompare(b, 'tr')) }))

  const versionById = new Map(scoped.map(version => [version.id, version]))
  const objectives = (listResult.data || []).map(row => ({ ...row, version: versionById.get(row.curriculum_version_id) || null }))
  return NextResponse.json({ objectives, total: listResult.count || 0, catalogTotal: facetRows.length, filters, versions: scoped, facets })
}
