import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { extractGradeNumber } from '@/lib/subject-map-grade'
import { fetchAllRows } from '@/lib/paginate'
import { applicableScopes, hasLocation } from '@/lib/location/curriculum-scope'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const authDb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: { user } } = await authDb.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const requestedGrade = req.nextUrl.searchParams.get('grade') || ''
  const gradeNumber = extractGradeNumber(requestedGrade)
  if (gradeNumber === null) {
    return NextResponse.json({ error: 'Geçerli sınıf bilgisi gerekli.' }, { status: 400 })
  }

  // Konum zorunlu: yalnız kullanıcının ülkesine (ve varsa eyalet/şehrine) uygulanan aktif müfredat gösterilir.
  const { data: profile } = await adminDb.from('profiles').select('role,is_admin,country,state,city').eq('id', user.id).maybeSingle()
  const mustHaveLocation = profile?.role === 'student' && profile.is_admin !== true
  if (mustHaveLocation && !hasLocation(profile)) {
    return NextResponse.json({ error: 'location_required', message: 'Konu listesi için profilinizden ülke, eyalet ve şehir bilgisini girin.' }, { status: 422 })
  }
  const { data: versions, error: versionError } = await adminDb
    .from('curriculum_versions')
    .select('id,code,country,state,city')
    .eq('status', 'active')
  const candidates = hasLocation(profile) ? applicableScopes(versions || [], profile!) : (versions || []).filter(row => row.country === 'TR' && !row.state && !row.city)
  const version = candidates[0]
  if (versionError || !version) {
    return NextResponse.json({ error: 'Konumunuz için aktif müfredat bulunamadı.' }, { status: 503 })
  }

  let data: Array<{ subject: string | null; grade: string | null; unit: string | null; topic: string | null; objective_code: string | null }>
  try {
    data = await fetchAllRows((from, to) => adminDb
      .from('learning_objective_catalog')
      .select('subject,grade,unit,topic,objective_code')
      .eq('curriculum_version_id', version.id)
      .eq('verification_status', 'verified')
      .eq('lifecycle_status', 'active')
      .eq('is_active', true)
      .eq('grade', `${gradeNumber}. sınıf`)
      .not('current_revision_id', 'is', null)
      .order('subject')
      .order('objective_code')
      .order('id')
      .range(from, to))
  } catch {
    return NextResponse.json({ error: 'Müfredat konuları alınamadı.' }, { status: 500 })
  }

  const topicsBySubject: Record<string, string[]> = {}
  for (const row of data) {
    const subject = clean(row.subject)
    const topic = clean(row.unit) || clean(row.topic)
    if (!subject || !topic) continue
    if (!topicsBySubject[subject]) topicsBySubject[subject] = []
    if (!topicsBySubject[subject].includes(topic)) topicsBySubject[subject].push(topic)
  }

  return NextResponse.json({
    curriculumVersion: version.code,
    grade: `${gradeNumber}. sınıf`,
    topicsBySubject,
  })
}
