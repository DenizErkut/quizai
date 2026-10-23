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
  const detailId = params.get('id')
  if (detailId) return objectiveDetail(detailId)
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

type RpcError = { message: string }
const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// Tek kazanımın ayrıntısı: kayıt, sürüm, revizyon geçmişi, denetim kayıtları ve kullanım sayıları.
async function objectiveDetail(id: string) {
  const [objective, revisions, audit, usage] = await Promise.all([
    adminDb.from('learning_objective_catalog').select('*').eq('id', id).maybeSingle(),
    adminDb.from('learning_objective_revisions')
      .select('id,revision_number,revision_status,title,change_reason,curriculum_version_id,created_at,published_at').eq('objective_id', id).order('revision_number', { ascending: false }),
    adminDb.from('learning_objective_lifecycle_audit')
      .select('id,action,reason,created_at').eq('objective_id', id).order('created_at', { ascending: false }).limit(20),
    adminDb.rpc('learning_objective_usage_v1', { p_objective_id: id }),
  ])
  if (objective.error || !objective.data) return NextResponse.json({ error: 'Kazanım bulunamadı.' }, { status: 404 })
  const version = objective.data.curriculum_version_id
    ? (await adminDb.from('curriculum_versions').select('id,code,title,status,authority,country,state,city').eq('id', objective.data.curriculum_version_id).maybeSingle()).data
    : null
  return NextResponse.json({ objective: objective.data, version, revisions: revisions.data || [], audit: audit.data || [], usage: usage.data || null, usageError: usage.error?.message || null })
}

// Düzenleme: başlık ve kaynak referansı (gerekçe zorunlu); aktif revizyon, grafik düğümü ve denetim kaydı birlikte güncellenir.
export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const id = clean(body?.id, 64)
  const title = clean(body?.title, 1000)
  const reason = clean(body?.reason, 500)
  if (!id || title.length < 3 || reason.length < 3) {
    return NextResponse.json({ error: 'Kazanım metni (en az 3 karakter) ve değişiklik gerekçesi (en az 3 karakter) zorunludur.' }, { status: 400 })
  }
  const { data, error } = await adminDb.rpc('edit_learning_objective_v1', {
    p_objective_id: id, p_actor_id: user.id, p_title: title, p_source_reference: clean(body?.sourceReference, 1000) || null, p_reason: reason,
  })
  if (error) return NextResponse.json({ error: (error as RpcError).message }, { status: 400 })
  return NextResponse.json({ success: true, result: data })
}

// Silme: kazanımın kodu birebir yazılarak onaylanmalı; kullanımda olan kazanım silinmez (409), emekli edilmesi önerilir.
export async function DELETE(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const id = clean(body?.id, 64)
  const reason = clean(body?.reason, 500)
  if (!id || reason.length < 3) return NextResponse.json({ error: 'Silme gerekçesi (en az 3 karakter) zorunludur.' }, { status: 400 })
  const found = await adminDb.from('learning_objective_catalog').select('objective_code').eq('id', id).maybeSingle()
  if (found.error || !found.data) return NextResponse.json({ error: 'Kazanım bulunamadı.' }, { status: 404 })
  if (clean(body?.confirmCode, 80) !== found.data.objective_code) {
    return NextResponse.json({ error: 'Silmeyi onaylamak için kazanım kodunu aynen yazın.' }, { status: 400 })
  }
  const { data, error } = await adminDb.rpc('delete_learning_objective_v1', { p_objective_id: id, p_actor_id: user.id, p_reason: reason })
  if (error) {
    const message = (error as RpcError).message
    if (message.startsWith('objective_in_use:')) {
      let usage: unknown = null
      try { usage = JSON.parse(message.slice('objective_in_use:'.length).trim()) } catch { /* ayrıntı okunamadı */ }
      return NextResponse.json({ error: 'Bu kazanım kullanımda olduğu için silinemez; bunun yerine emekli edebilirsiniz.', code: 'in_use', usage }, { status: 409 })
    }
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ success: true, result: data })
}
