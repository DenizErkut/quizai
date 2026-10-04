import { NextRequest, NextResponse } from 'next/server'
import { loadCycleMetrics } from '@/lib/load-verified-learning-metrics'
import { createClient } from '@/lib/supabase/server-create-client'
import { buildTeacherContext, getAuthedUser } from '@/lib/report-context'
import { questionBankKey } from '@/lib/question-bank'
import { sameLearningScope } from '@/lib/learning-evidence-scope'
import { allocateVerifiedItemSets, eligibleVerifiedItem, hasSeparatePracticeItem, type VerifiedBankRow } from '@/lib/verified-learning-cycle'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function gradeNumber(value: string) { return value.match(/\d+/)?.[0] || '' }

async function scope(req: NextRequest, classroomId: string, studentId: string) {
  const user = await getAuthedUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 }) }
  const context = await buildTeacherContext(user.id, classroomId)
  if (!context || !context.classrooms.some(item => item.id === classroomId) || !context.roster.some(item => item.id === studentId)) {
    return { error: NextResponse.json({ error: 'Bu sınıf veya öğrenci için yetki yok.' }, { status: 403 }) }
  }
  return { context }
}

export async function GET(req: NextRequest) {
  const classroomId = req.nextUrl.searchParams.get('classroomId') || ''
  const studentId = req.nextUrl.searchParams.get('studentId') || ''
  if (!UUID.test(classroomId) || !UUID.test(studentId)) return NextResponse.json({ error: 'Sınıf ve öğrenci gerekli.' }, { status: 400 })
  const result = await scope(req, classroomId, studentId)
  if (result.error) return result.error
  const [{ data: classroom }, { data: cycles, error: cycleError }] = await Promise.all([
    db.from('classrooms').select('grade,subject').eq('id', classroomId).eq('teacher_id', result.context!.teacherId).maybeSingle(),
    db.from('verified_learning_cycles').select('id,learning_objective_id,status,created_at')
      .eq('teacher_id', result.context!.teacherId).eq('classroom_id', classroomId).eq('student_id', studentId)
      .order('created_at', { ascending: false }).limit(30),
  ])
  if (!classroom || cycleError) return NextResponse.json({ error: 'Pilot hazırlığı alınamadı.' }, { status: 500 })
  const rows: VerifiedBankRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from('question_bank').select('id,question,grade_key,subject_key')
      .eq('review_status', 'approved').eq('report_count', 0)
      .not('question->>learningObjectiveId', 'is', null).order('id').range(offset, offset + 499)
    if (error) return NextResponse.json({ error: 'Soru stoğu alınamadı.' }, { status: 500 })
    rows.push(...((data || []) as VerifiedBankRow[]))
    if ((data || []).length < 500) break
  }
  const ids = [...new Set(rows.map(row => String(row.question.learningObjectiveId || '')).filter(Boolean))]
  const { data: objectives, error: objectiveError } = ids.length
    ? await db.from('learning_objective_catalog').select('id,objective_code,title,grade,subject,is_active,verification_status').in('id', ids)
    : { data: [], error: null }
  if (objectiveError) return NextResponse.json({ error: 'Kazanım stoğu alınamadı.' }, { status: 500 })
  const options = (objectives || []).filter(objective => objective.is_active && objective.verification_status === 'verified'
    && gradeNumber(objective.grade) === gradeNumber(classroom.grade)
    && (!classroom.subject || questionBankKey(classroom.subject) === 'tum dersler' || questionBankKey(classroom.subject) === questionBankKey(objective.subject)))
    .map(objective => {
      const relevant = rows.filter(row => sameLearningScope({ grade:row.grade_key,subject:row.subject_key },objective)
        && eligibleVerifiedItem(row, objective.id))
      const sets = allocateVerifiedItemSets(relevant, objective.id)
      return { ...objective, availableItems: relevant.length, ready: Boolean(sets && hasSeparatePracticeItem(relevant, objective.id, sets)) }
    }).sort((a, b) => Number(b.ready) - Number(a.ready) || b.availableItems - a.availableItems)
  const cycleIds = (cycles || []).map(cycle => cycle.id)
  const { data: attempts } = cycleIds.length
    ? await db.from('verified_learning_attempts').select('cycle_id,stage,status,score_pct,completed_at,quiz_session_id').in('cycle_id', cycleIds)
    : { data: [] }
  return NextResponse.json({ options, cycles: await Promise.all((cycles || []).map(async cycle => ({
    ...cycle, objective: objectives?.find(item => item.id === cycle.learning_objective_id),
    metrics: await loadCycleMetrics(db, { ...cycle, student_id: studentId, classroom_id: classroomId, teacher_id: result.context!.teacherId }).catch(() => null),
    attempts: (attempts || []).filter(attempt => attempt.cycle_id === cycle.id),
  }))) })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { classroomId?: string; studentId?: string; objectiveId?: string } | null
  if (!body || !UUID.test(body.classroomId || '') || !UUID.test(body.studentId || '') || !UUID.test(body.objectiveId || '')) {
    return NextResponse.json({ error: 'Sınıf, öğrenci ve kazanım gerekli.' }, { status: 400 })
  }
  const result = await scope(req, body.classroomId!, body.studentId!)
  if (result.error) return result.error
  const [{ data: classroom }, { data: student }, { data: objective }, { data: bank, error: bankError }] = await Promise.all([
    db.from('classrooms').select('grade,subject').eq('id', body.classroomId!).eq('teacher_id', result.context!.teacherId).maybeSingle(),
    db.from('profiles').select('grade').eq('id', body.studentId!).maybeSingle(),
    db.from('learning_objective_catalog').select('id,grade,subject,is_active,verification_status').eq('id', body.objectiveId!).maybeSingle(),
    db.from('question_bank').select('id,question,grade_key,subject_key').eq('review_status', 'approved').eq('report_count', 0)
      .eq('question->>learningObjectiveId', body.objectiveId!).limit(100),
  ])
  if (bankError || !classroom || !student || !objective || !objective.is_active || objective.verification_status !== 'verified' ||
    gradeNumber(classroom.grade) !== gradeNumber(objective.grade) || gradeNumber(student.grade) !== gradeNumber(objective.grade) ||
    (classroom.subject && questionBankKey(classroom.subject) !== 'tum dersler' && questionBankKey(classroom.subject) !== questionBankKey(objective.subject))) {
    return NextResponse.json({ error: 'Öğrenci, sınıf, ders veya doğrulanmış kazanım uyumsuz.' }, { status: 422 })
  }
  const matching = ((bank || []) as VerifiedBankRow[]).filter(row => sameLearningScope({ grade:row.grade_key,subject:row.subject_key },objective))
  const sets = allocateVerifiedItemSets(matching, objective.id)
  const eligibleCount = matching.filter(row => eligibleVerifiedItem(row, objective.id)).length
  if (!sets || !hasSeparatePracticeItem(matching, objective.id, sets)) return NextResponse.json({ error: 'Üç ölçüm seti ve ayrı rehberli çalışma için en az 16 farklı, kalite doğrulanmış soru gerekiyor.', availableItems: eligibleCount, requiredItems: 16 }, { status: 422 })
  const { data: cycle, error } = await db.from('verified_learning_cycles').insert({
    teacher_id: result.context!.teacherId, classroom_id: body.classroomId, student_id: body.studentId,
    learning_objective_id: objective.id, item_sets: sets,
  }).select('id').maybeSingle()
  if (error || !cycle) return NextResponse.json({ error: error?.code === '23505' ? 'Bu öğrenci ve kazanım için zaten etkin pilot var.' : 'Pilot oluşturulamadı.' }, { status: error?.code === '23505' ? 409 : 500 })
  return NextResponse.json({ cycleId: cycle.id }, { status: 201 })
}
