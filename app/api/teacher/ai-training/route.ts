import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { TEACHER_AI_TRAINING_VERSION } from '@/lib/teacher-ai-training-course'
import { scoreTeacherTrainingModule } from '@/lib/teacher-ai-training-assessment'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const COURSE_VERSION = TEACHER_AI_TRAINING_VERSION
async function getApprovedTeacher(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const { data: teacher } = await db.from('teachers').select('id,approved').eq('user_id', user.id).maybeSingle()
  return teacher?.approved ? user : null
}

export async function GET(req: NextRequest) {
  const user = await getApprovedTeacher(req)
  if (!user) return NextResponse.json({ error: 'Yalnızca onaylı öğretmenler erişebilir.' }, { status: 403 })
  const [{ data: modules, error: moduleError }, { data: certificate, error: certificateError }] = await Promise.all([
    db.from('teacher_ai_training_module_completions').select('module_id,passed,score,attempt_count,attested_at,passed_at').eq('user_id', user.id).eq('course_version', COURSE_VERSION),
    db.from('teacher_ai_training_certificates').select('certificate_id,issued_at,course_version').eq('user_id', user.id).eq('course_version', COURSE_VERSION).maybeSingle(),
  ])
  if (moduleError || certificateError) return NextResponse.json({ error: 'Eğitim ilerlemesi alınamadı.' }, { status: 500 })
  return NextResponse.json({ courseVersion: COURSE_VERSION, modules: modules || [], certificate: certificate || null, passingScore: '4 soruda en az 3 doğru' })
}

export async function POST(req: NextRequest) {
  const user = await getApprovedTeacher(req)
  if (!user) return NextResponse.json({ error: 'Yalnızca onaylı öğretmenler erişebilir.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const moduleId = body?.moduleId as string
  if (!['verify', 'curriculum', 'pedagogy', 'safety'].includes(moduleId)) return NextResponse.json({ error: 'Eğitim modülü geçersiz.' }, { status: 400 })
  if (body?.attestedRead !== true) return NextResponse.json({ error: 'Önce modül içeriğini tamamladığınızı onaylayın.' }, { status: 400 })
  const assessment = scoreTeacherTrainingModule(moduleId, body?.answers)
  if (!assessment) return NextResponse.json({ error: 'Dört sorunun da yanıtını seçin.' }, { status: 400 })
  const { data: prior, error: priorError } = await db.from('teacher_ai_training_module_completions').select('passed,attempt_count')
    .eq('user_id', user.id).eq('course_version', COURSE_VERSION).eq('module_id', moduleId).maybeSingle()
  if (priorError) return NextResponse.json({ error: 'Önceki ilerleme alınamadı.' }, { status: 500 })
  if (prior?.passed) return NextResponse.json({ error: 'Bu modül daha önce başarıyla tamamlanmış.' }, { status: 409 })

  const { results, score, passed } = assessment
  const now = new Date().toISOString()
  const { error } = await db.from('teacher_ai_training_module_completions').upsert({
    user_id: user.id, course_version: COURSE_VERSION, module_id: moduleId, passed, score,
    attempt_count: (prior?.attempt_count || 0) + 1, attested_at: now, passed_at: passed ? now : null, updated_at: now,
  }, { onConflict: 'user_id,course_version,module_id' })
  if (error) return NextResponse.json({ error: 'Modül sonucu kaydedilemedi.' }, { status: 500 })

  const { data: completions } = await db.from('teacher_ai_training_module_completions').select('module_id,passed')
    .eq('user_id', user.id).eq('course_version', COURSE_VERSION).eq('passed', true)
  const allPassed = ['verify', 'curriculum', 'pedagogy', 'safety'].every(id => completions?.some(row => row.module_id === id))
  let certificate = null
  if (allPassed) {
    const { data: existingCertificate } = await db.from('teacher_ai_training_certificates').select('certificate_id,issued_at,course_version')
      .eq('user_id', user.id).eq('course_version', COURSE_VERSION).maybeSingle()
    if (existingCertificate) certificate = existingCertificate
    else {
      const { data: inserted } = await db.from('teacher_ai_training_certificates').upsert({ user_id: user.id, course_version: COURSE_VERSION,
        certificate_id: randomUUID(), issued_at: now }, { onConflict: 'user_id,course_version' }).select('certificate_id,issued_at,course_version').single()
      certificate = inserted
    }
  }
  return NextResponse.json({ moduleId, score, passed, passingScore: 3, attemptCount: (prior?.attempt_count || 0) + 1,
    results, completedModules: completions?.length || 0, totalModules: 4, certificate })
}
