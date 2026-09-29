import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { buildTeacherContext, getAuthedUser } from '@/lib/report-context'
import { inspectMeasurementPair, inspectMeasurementSession, type MeasurementSession } from '@/lib/learning-gain-measurement'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function teacherScope(req: NextRequest, classroomId: string) {
  const user = await getAuthedUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 }) }
  const context = await buildTeacherContext(user.id, classroomId)
  if (!context || !context.classrooms.some(item => item.id === classroomId)) {
    return { error: NextResponse.json({ error: 'Sınıf yetkisi bulunamadı.' }, { status: 403 }) }
  }
  return { user, context }
}

export async function GET(req: NextRequest) {
  const classroomId = req.nextUrl.searchParams.get('classroomId') || ''
  if (!UUID.test(classroomId)) return NextResponse.json({ error: 'Sınıf seçimi gerekli.' }, { status: 400 })
  const scope = await teacherScope(req, classroomId)
  if (scope.error) return scope.error
  const { context } = scope
  const studentId = req.nextUrl.searchParams.get('studentId') || ''
  if (studentId && (!UUID.test(studentId) || !context!.roster.some(item => item.id === studentId))) {
    return NextResponse.json({ error: 'Öğrenci bu sınıfta değil.' }, { status: 403 })
  }

  const { data: measurements, error: measurementError } = await db.from('learning_gain_measurements')
    .select('id,student_id,learning_objective_id,pre_score_pct,post_score_pct,gain_pp,item_count,pre_completed_at,post_completed_at,transfer_session_id,transfer_score_pct,transfer_gain_pp,transfer_completed_at,created_at')
    .eq('teacher_id', context!.teacherId).eq('classroom_id', classroomId)
    .order('created_at', { ascending: false }).limit(100)
  if (measurementError) return NextResponse.json({ error: 'Ölçüm kayıtları alınamadı; veritabanı güncellemesini kontrol edin.' }, { status: 500 })

  let sessions: Array<Record<string, unknown>> = []
  if (studentId) {
    const { data, error } = await db.from('quiz_sessions')
      .select('id,user_id,completed,question_count,questions,answers,created_at,topic,grade')
      .eq('user_id', studentId).eq('completed', true)
      .order('created_at', { ascending: false }).limit(60)
    if (error) return NextResponse.json({ error: 'Test oturumları alınamadı.' }, { status: 500 })
    sessions = (data ?? []).map(session => {
      const checked = inspectMeasurementSession(session as MeasurementSession)
      return {
        id: session.id,
        createdAt: session.created_at,
        topic: session.topic,
        grade: session.grade,
        objectiveId: checked.evidence?.objectiveId ?? null,
        scorePct: checked.evidence?.scorePct ?? null,
        itemCount: checked.evidence?.itemCount ?? session.question_count,
        ineligibleReason: checked.reason,
        questions: checked.evidence ? (session.questions as Array<{ q?: string; opts?: string[]; ans?: number }>).map(question => ({
          text: question.q, options: question.opts, correctIndex: question.ans,
        })) : [],
      }
    })
  }
  const objectiveIds = [...new Set([
    ...(measurements ?? []).map(row => row.learning_objective_id),
    ...sessions.map(row => row.objectiveId).filter(Boolean),
  ])] as string[]
  const { data: objectives, error: objectiveError } = objectiveIds.length
    ? await db.from('learning_objective_catalog').select('id,objective_code,title,verification_status,is_active').in('id', objectiveIds)
    : { data: [], error: null }
  if (objectiveError) return NextResponse.json({ error: 'Kazanım bilgileri alınamadı.' }, { status: 500 })
  const objectiveById = new Map((objectives ?? []).map(row => [row.id, row]))
  const rosterById = new Map(context!.roster.map(item => [item.id, item.fullName]))
  const rows = (measurements ?? []).map(row => ({
    ...row,
    studentName: rosterById.get(row.student_id) ?? 'Öğrenci',
    objectiveCode: objectiveById.get(row.learning_objective_id)?.objective_code ?? '—',
    objectiveTitle: objectiveById.get(row.learning_objective_id)?.title ?? '—',
  }))
  const latestByStudentObjective = new Map<string, typeof rows[number]>()
  for (const row of rows) {
    const key = `${row.student_id}:${row.learning_objective_id}`
    if (!latestByStudentObjective.has(key)) latestByStudentObjective.set(key, row)
  }
  const uniqueRows = [...latestByStudentObjective.values()]
  const averageGain = uniqueRows.length >= 5
    ? Math.round(uniqueRows.reduce((sum, row) => sum + Number(row.gain_pp), 0) / uniqueRows.length * 100) / 100
    : null
  return NextResponse.json({
    students: [...new Map(context!.roster.map(item => [item.id, { id: item.id, name: item.fullName }])).values()],
    sessions: sessions.map(row => ({ ...row, objectiveCode: objectiveById.get(row.objectiveId as string)?.objective_code ?? null,
      objectiveTitle: objectiveById.get(row.objectiveId as string)?.title ?? null,
      ineligibleReason: row.ineligibleReason || (objectiveById.get(row.objectiveId as string)?.verification_status !== 'verified' || !objectiveById.get(row.objectiveId as string)?.is_active ? 'Kazanım aktif ve doğrulanmış değil.' : null),
    })),
    measurements: rows,
    summary: { pairedStudents: new Set(uniqueRows.map(row => row.student_id)).size, pairedObjectives: uniqueRows.length, averageGainPp: averageGain, minimumSummaryPairs: 5 },
    interpretation: 'Betimleyici pilot ölçümü; tek başına müdahalenin etkisini kanıtlamaz.',
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    classroomId?: string; studentId?: string; objectiveId?: string;
    preSessionId?: string; postSessionId?: string; reviewed?: boolean
  } | null
  if (!body || ![body.classroomId, body.studentId, body.objectiveId, body.preSessionId, body.postSessionId].every(value => UUID.test(value || '')) || body.reviewed !== true) {
    return NextResponse.json({ error: 'Sınıf, öğrenci, kazanım, iki test ve insan incelemesi gerekli.' }, { status: 400 })
  }
  if (body.preSessionId === body.postSessionId) return NextResponse.json({ error: 'İki farklı test gerekli.' }, { status: 400 })
  const scope = await teacherScope(req, body.classroomId!)
  if (scope.error) return scope.error
  if (!scope.context!.roster.some(item => item.id === body.studentId)) return NextResponse.json({ error: 'Öğrenci bu sınıfta değil.' }, { status: 403 })

  const [{ data: objective, error: objectiveError }, { data: sessions, error: sessionError }] = await Promise.all([
    db.from('learning_objective_catalog').select('id,verification_status,is_active').eq('id', body.objectiveId!).maybeSingle(),
    db.from('quiz_sessions').select('id,user_id,completed,question_count,questions,answers')
      .eq('user_id', body.studentId!).in('id', [body.preSessionId!, body.postSessionId!]),
  ])
  if (objectiveError || sessionError) return NextResponse.json({ error: 'Ölçüm kanıtı alınamadı.' }, { status: 500 })
  if (!objective || objective.verification_status !== 'verified' || !objective.is_active) {
    return NextResponse.json({ error: 'Kazanım aktif ve doğrulanmış olmalı.' }, { status: 422 })
  }
  const pre = sessions?.find(item => item.id === body.preSessionId)
  const post = sessions?.find(item => item.id === body.postSessionId)
  if (!pre || !post) return NextResponse.json({ error: 'Testler öğrenciye ait değil.' }, { status: 404 })
  const preCheck = inspectMeasurementSession(pre as MeasurementSession)
  const postCheck = inspectMeasurementSession(post as MeasurementSession)
  if (!preCheck.evidence || !postCheck.evidence) {
    return NextResponse.json({ error: preCheck.reason || postCheck.reason }, { status: 422 })
  }
  if (preCheck.evidence.objectiveId !== body.objectiveId || postCheck.evidence.objectiveId !== body.objectiveId) {
    return NextResponse.json({ error: 'Testler seçilen kazanımı ölçmüyor.' }, { status: 422 })
  }

  const { data: events, error: eventError } = await db.from('learning_events')
    .select('source_id,question_index,learning_objective_id,occurred_at')
    .eq('student_id', body.studentId!).eq('source_type', 'quiz_session')
    .in('source_id', [pre.id, post.id]).limit(100)
  if (eventError) return NextResponse.json({ error: 'Öğrenme olayları alınamadı.' }, { status: 500 })
  const eventTime = (session: MeasurementSession) => {
    const matching = (events ?? []).filter(event => event.source_id === session.id)
    if (matching.length !== session.question_count || matching.some(event => event.learning_objective_id !== body.objectiveId) ||
      new Set(matching.map(event => event.question_index)).size !== session.question_count) return null
    return matching.map(event => event.occurred_at).sort().at(-1) || null
  }
  const preAt = eventTime(pre as MeasurementSession)
  const postAt = eventTime(post as MeasurementSession)
  if (!preAt || !postAt) return NextResponse.json({ error: 'Testlerin doğrulanmış öğrenme olayları eksik.' }, { status: 422 })
  const pairIssue = inspectMeasurementPair(preCheck.evidence, postCheck.evidence, preAt, postAt)
  if (pairIssue) return NextResponse.json({ error: pairIssue }, { status: 422 })

  const gainPp = Math.round((postCheck.evidence.scorePct - preCheck.evidence.scorePct) * 100) / 100
  const { data, error } = await db.from('learning_gain_measurements').insert({
    teacher_id: scope.context!.teacherId,
    classroom_id: body.classroomId,
    student_id: body.studentId,
    learning_objective_id: body.objectiveId,
    pre_session_id: pre.id,
    post_session_id: post.id,
    pre_score_pct: preCheck.evidence.scorePct,
    post_score_pct: postCheck.evidence.scorePct,
    gain_pp: gainPp,
    item_count: preCheck.evidence.itemCount,
    pre_completed_at: preAt,
    post_completed_at: postAt,
    reviewed_by: scope.user!.id,
  }).select('id,pre_score_pct,post_score_pct,gain_pp').single()
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Bu test çifti daha önce kaydedildi.' : 'Ölçüm kaydedilemedi.' }, { status: error.code === '23505' ? 409 : 500 })
  return NextResponse.json({ measurement: data }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    classroomId?: string; measurementId?: string; transferSessionId?: string; reviewed?: boolean
  } | null
  if (!body || ![body.classroomId, body.measurementId, body.transferSessionId].every(value => UUID.test(value || '')) || body.reviewed !== true) {
    return NextResponse.json({ error: 'Ölçüm, aktarım testi ve insan incelemesi gerekli.' }, { status: 400 })
  }
  const scope = await teacherScope(req, body.classroomId!)
  if (scope.error) return scope.error
  const { data: measurement, error: measurementError } = await db.from('learning_gain_measurements')
    .select('id,student_id,learning_objective_id,pre_session_id,post_session_id,pre_score_pct,post_score_pct,pre_completed_at,post_completed_at,transfer_session_id')
    .eq('id', body.measurementId!).eq('teacher_id', scope.context!.teacherId).eq('classroom_id', body.classroomId!).maybeSingle()
  if (measurementError) return NextResponse.json({ error: 'Ölçüm alınamadı.' }, { status: 500 })
  if (!measurement || !scope.context!.roster.some(item => item.id === measurement.student_id)) {
    return NextResponse.json({ error: 'Ölçüm bu sınıfa ait değil.' }, { status: 404 })
  }
  if (measurement.transfer_session_id) return NextResponse.json({ error: 'Aktarım testi zaten kaydedilmiş.' }, { status: 409 })
  if ([measurement.pre_session_id, measurement.post_session_id].includes(body.transferSessionId)) {
    return NextResponse.json({ error: 'Aktarım için farklı bir test gerekli.' }, { status: 422 })
  }
  const { data: sessions, error: sessionError } = await db.from('quiz_sessions')
    .select('id,user_id,completed,question_count,questions,answers')
    .eq('user_id', measurement.student_id)
    .in('id', [measurement.pre_session_id, measurement.post_session_id, body.transferSessionId!])
  if (sessionError) return NextResponse.json({ error: 'Testler alınamadı.' }, { status: 500 })
  const pre = sessions?.find(item => item.id === measurement.pre_session_id)
  const post = sessions?.find(item => item.id === measurement.post_session_id)
  const transfer = sessions?.find(item => item.id === body.transferSessionId)
  if (!pre || !post || !transfer) return NextResponse.json({ error: 'Testler öğrenciye ait değil.' }, { status: 404 })
  const preCheck = inspectMeasurementSession(pre as MeasurementSession)
  const postCheck = inspectMeasurementSession(post as MeasurementSession)
  const transferCheck = inspectMeasurementSession(transfer as MeasurementSession)
  if (!preCheck.evidence || !postCheck.evidence || !transferCheck.evidence ||
    [preCheck.evidence, postCheck.evidence, transferCheck.evidence].some(item => item.objectiveId !== measurement.learning_objective_id)) {
    return NextResponse.json({ error: transferCheck.reason || 'Testlerin kazanım veya kalite kanıtı uygun değil.' }, { status: 422 })
  }
  if (preCheck.evidence.scorePct !== Number(measurement.pre_score_pct) || postCheck.evidence.scorePct !== Number(measurement.post_score_pct)) {
    return NextResponse.json({ error: 'Önceki ölçüm kanıtı değişmiş; aktarım eklenemez.' }, { status: 409 })
  }
  const { data: events, error: eventError } = await db.from('learning_events')
    .select('source_id,question_index,learning_objective_id,occurred_at')
    .eq('student_id', measurement.student_id).eq('source_type', 'quiz_session')
    .eq('source_id', transfer.id).limit(50)
  if (eventError) return NextResponse.json({ error: 'Aktarım kanıtı alınamadı.' }, { status: 500 })
  if ((events ?? []).length !== transfer.question_count ||
    (events ?? []).some(item => item.learning_objective_id !== measurement.learning_objective_id) ||
    new Set((events ?? []).map(item => item.question_index)).size !== transfer.question_count) {
    return NextResponse.json({ error: 'Aktarım testinin doğrulanmış öğrenme olayları eksik.' }, { status: 422 })
  }
  const transferAt = (events ?? []).map(item => item.occurred_at).sort().at(-1)
  if (!transferAt) return NextResponse.json({ error: 'Aktarım zamanı bulunamadı.' }, { status: 422 })
  const issue = inspectMeasurementPair(postCheck.evidence, transferCheck.evidence, measurement.post_completed_at, transferAt) ||
    inspectMeasurementPair(preCheck.evidence, transferCheck.evidence, measurement.pre_completed_at, transferAt)
  if (issue) return NextResponse.json({ error: issue }, { status: 422 })
  const transferGainPp = Math.round((transferCheck.evidence.scorePct - preCheck.evidence.scorePct) * 100) / 100
  const { data, error } = await db.from('learning_gain_measurements').update({
    transfer_session_id: transfer.id,
    transfer_score_pct: transferCheck.evidence.scorePct,
    transfer_gain_pp: transferGainPp,
    transfer_completed_at: transferAt,
    transfer_reviewed_by: scope.user!.id,
    transfer_reviewed_at: new Date().toISOString(),
  }).eq('id', measurement.id).is('transfer_session_id', null)
    .select('id,transfer_score_pct,transfer_gain_pp').maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Aktarım kaydedilemedi veya başka oturumda zaten kaydedildi.' }, { status: 409 })
  return NextResponse.json({ measurement: data })
}
