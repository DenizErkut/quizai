import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { extractGradeNumber } from '@/lib/subject-map-grade'

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

  const { data: version, error: versionError } = await adminDb
    .from('curriculum_versions')
    .select('id,code')
    .eq('authority', 'MEB')
    .eq('status', 'active')
    .maybeSingle()
  if (versionError || !version) {
    return NextResponse.json({ error: 'Aktif MEB müfredatı bulunamadı.' }, { status: 503 })
  }

  const { data, error } = await adminDb
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
    .limit(5000)

  if (error) return NextResponse.json({ error: 'Müfredat konuları alınamadı.' }, { status: 500 })

  const topicsBySubject: Record<string, string[]> = {}
  for (const row of data || []) {
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
