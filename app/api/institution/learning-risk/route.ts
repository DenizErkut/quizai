import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { buildLearningRiskOverview, MasteryRiskRow, StudentClass } from '@/lib/learning-risk-overview'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: membership } = await db.from('institution_users').select('institution_id, institutions(name)').eq('user_id', user.id).eq('role', 'admin').maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const { data: members, error: memberError } = await db.from('institution_users').select('user_id').eq('institution_id', membership.institution_id).eq('role', 'student').limit(10000)
  if (memberError) return NextResponse.json({ error: 'Öğrenciler alınamadı.' }, { status: 500 })
  const studentIds = [...new Set((members ?? []).map(item => item.user_id))]
  if (!studentIds.length) return NextResponse.json({ classrooms: [], counts: { high_students: 0, medium_students: 0, total_warnings: 0 }, warnings: [] })
  const { data: institution } = await db.from('institutions').select('name').eq('id', membership.institution_id).maybeSingle()
  const { data: mastery, error: masteryError } = await db.from('student_mastery').select('student_id,subject,topic,mastery_score,confidence_score,retention_score,attempt_count,trend,last_practiced_at').in('student_id', studentIds).eq('learning_objective_key', '').gte('attempt_count', 3).gte('confidence_score', 0.3).limit(10000)
  if (masteryError) return NextResponse.json({ error: 'Risk verisi alınamadı.' }, { status: 500 })
  const institutionClass: StudentClass = { id: String(membership.institution_id), name: institution?.name || 'Kurum geneli' }
  const studentClasses = new Map(studentIds.map(id => [id, [institutionClass]]))
  const identities = await getIdentitiesBySupabaseIds(studentIds)
  const names = Object.fromEntries(studentIds.map(id => [id, identities[id]?.full_name || 'Öğrenci']))
  const overview = buildLearningRiskOverview((mastery ?? []) as MasteryRiskRow[], studentClasses, names)
  return NextResponse.json({ classrooms: [institutionClass], ...overview, warnings: overview.warnings.slice(0, 200), policy_version: 'predictive-learning-v1' })
}
