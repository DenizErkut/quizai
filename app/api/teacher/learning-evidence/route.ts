import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { buildTeacherContext, getAuthedUser } from '@/lib/report-context'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const classroomId = req.nextUrl.searchParams.get('classroomId') || ''
  const studentId = req.nextUrl.searchParams.get('studentId') || ''
  const objectiveId = req.nextUrl.searchParams.get('objectiveId') || ''
  if (!UUID.test(classroomId) || !UUID.test(studentId) || (objectiveId && !UUID.test(objectiveId))) {
    return NextResponse.json({ error: 'Sınıf, öğrenci veya kazanım geçersiz.' }, { status: 400 })
  }
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  const context = await buildTeacherContext(user.id, classroomId)
  if (!context || !context.classrooms.some(item => item.id === classroomId) || !context.roster.some(item => item.id === studentId)) {
    return NextResponse.json({ error: 'Bu öğrenci veya sınıf için yetki yok.' }, { status: 403 })
  }

  if (!objectiveId) {
    const { data: events, error } = await db.from('learning_events').select('learning_objective_id')
      .eq('student_id', studentId).not('learning_objective_id', 'is', null).order('occurred_at', { ascending: false }).limit(1000)
    if (error) return NextResponse.json({ error: 'Kazanım kanıtları alınamadı.' }, { status: 500 })
    const ids = [...new Set((events || []).map(row => row.learning_objective_id).filter((id): id is string => Boolean(id && UUID.test(id))))]
    const { data: objectives, error: objectiveError } = ids.length
      ? await db.from('learning_objective_catalog').select('id,objective_code,title,subject,topic').in('id', ids)
      : { data: [], error: null }
    if (objectiveError) return NextResponse.json({ error: 'Kazanımlar alınamadı.' }, { status: 500 })
    return NextResponse.json({ objectives: objectives || [] })
  }

  const { data: objective, error: objectiveError } = await db.from('learning_objective_catalog')
    .select('id,objective_code,title,subject,topic,verification_status,is_active').eq('id', objectiveId).maybeSingle()
  if (objectiveError || !objective) return NextResponse.json({ error: 'Kazanım bulunamadı.' }, { status: 404 })
  const [events, mastery, misconceptions, recommendations, actions, checks, gains] = await Promise.all([
    db.from('learning_events').select('id,occurred_at,result,score,max_score,source_type,hint_used')
      .eq('student_id', studentId).eq('learning_objective_id', objectiveId).order('occurred_at', { ascending: false }).limit(200),
    db.from('student_mastery').select('mastery_score,confidence_score,attempt_count,correct_count,algorithm_version,last_mastery_update')
      .eq('student_id', studentId).eq('learning_objective_key', objectiveId).order('last_mastery_update', { ascending: false }).limit(1),
    db.from('student_misconceptions').select('misconception_id,status,evidence_count,confidence_score,last_seen_at')
      .eq('student_id', studentId).eq('subject', objective.subject).eq('topic', objective.topic || '').limit(30),
    db.from('student_recommendations').select('id,action_type,status,reason,generated_at,accepted_at,completed_at')
      .eq('student_id', studentId).eq('subject', objective.subject).eq('topic', objective.topic || '')
      .order('generated_at', { ascending: false }).limit(20),
    db.from('learning_risk_actions').select('id,action,status,created_at,completed_at')
      .eq('teacher_id', context.teacherId).eq('classroom_id', classroomId).eq('student_id', studentId)
      .eq('subject', objective.subject).eq('topic', objective.topic || '').order('created_at', { ascending: false }).limit(20),
    db.from('learning_transfer_checks').select('id,status,transfer_result,completed_at,result_metadata')
      .eq('student_id', studentId).eq('learning_objective_id', objectiveId).order('created_at', { ascending: false }).limit(30),
    db.from('learning_gain_measurements').select('id,pre_score_pct,post_score_pct,gain_pp,transfer_score_pct,transfer_gain_pp,post_completed_at,transfer_completed_at,measurement_version')
      .eq('teacher_id', context.teacherId).eq('classroom_id', classroomId).eq('student_id', studentId)
      .eq('learning_objective_id', objectiveId).order('created_at', { ascending: false }).limit(10),
  ])
  if ([events, mastery, misconceptions, recommendations, actions, checks, gains].some(result => result.error)) {
    return NextResponse.json({ error: 'Kanıt zinciri alınamadı.' }, { status: 500 })
  }
  const eventRows = events.data || []
  const transferRows = checks.data || []
  const gainRows = gains.data || []
  return NextResponse.json({
    objective,
    evidence: {
      answeredItems: eventRows.length,
      independentItems: eventRows.filter(row => !row.hint_used && row.source_type === 'quiz_session').length,
      firstObservedAt: eventRows.at(-1)?.occurred_at || null,
      lastObservedAt: eventRows[0]?.occurred_at || null,
      objectiveMastery: mastery.data?.[0] || null,
      topicMisconceptions: misconceptions.data || [],
      topicRecommendations: recommendations.data || [],
      topicTeacherActions: actions.data || [],
      transfer: { pending: transferRows.filter(row => row.status === 'pending').length,
        completed: transferRows.filter(row => row.status === 'completed').length,
        independentSuccess: transferRows.filter(row => row.status === 'completed' && row.transfer_result === 'independent_success' && row.result_metadata?.scoring === 'server-v1').length },
      teacherReviewedMeasurements: gainRows,
      verifiedGain: gainRows.find(row => row.transfer_completed_at && row.measurement_version === 'learning-gain-v2-server-scored-transfer') || null,
    },
    caveats: [
      'Konu düzeyindeki yanılgı, öneri ve öğretmen aksiyonları bu kazanıma özgü kesin sonuç değildir.',
      'Mastery skoru model tahminidir; öğretmen incelemeli önce/sonra ve yardımsız aktarım olmadan doğrulanmış öğrenme kazanımı değildir.',
      'Ön/son farkı müdahalenin nedensel etkisini tek başına kanıtlamaz.',
    ],
  })
}
