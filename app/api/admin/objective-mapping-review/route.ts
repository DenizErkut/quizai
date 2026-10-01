import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function adminId() {
  const jar = await cookies()
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: name => jar.get(name)?.value },
  })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin ? user.id : null
}

type Question = Record<string, unknown>
function gradeNumber(value: string) { return value.match(/\d+/)?.[0] || '' }
function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function reviewHistory(q: Question) { return Array.isArray(q.objectiveMappingReviews) ? q.objectiveMappingReviews : [] }
function updateQuestion(q: Question, objective: { id: string; objective_code: string; curriculum_version_id: string | null; current_revision_id: string | null } | null, reviewer: string, reason: string) {
  return {
    ...q,
    learningObjectiveId: objective?.id || null,
    learningObjectiveCode: objective?.objective_code || null,
    curriculumVersionId: objective?.curriculum_version_id || null,
    learningObjectiveRevisionId: objective?.current_revision_id || null,
    objectiveVerified: Boolean(objective),
    objectiveMappingStatus: objective ? 'human_approved' : 'human_rejected',
    objectiveMappingVersion: 'human-review-v1',
    objectiveMappingReviews: [...reviewHistory(q), {
      at: new Date().toISOString(), reviewer, reason,
      previousObjectiveId: text(q.learningObjectiveId) || null,
      objectiveId: objective?.id || null,
    }],
  }
}

export async function GET(req: NextRequest) {
  if (!(await adminId())) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  if (req.nextUrl.searchParams.get('mode') === 'candidates') {
    const subject = text(req.nextUrl.searchParams.get('subject'))
    const grade = gradeNumber(text(req.nextUrl.searchParams.get('grade')))
    const topic = text(req.nextUrl.searchParams.get('topic'))
    const search = text(req.nextUrl.searchParams.get('search')).slice(0, 100)
    if (!subject || !grade) return NextResponse.json({ candidates: [] })
    if (search) {
      const escaped = search.replace(/[%_,()]/g, '')
      const { data, error } = await db.from('learning_objective_catalog')
        .select('id,objective_code,title,topic,grade,subject')
        .eq('is_active', true).eq('verification_status', 'verified')
        .ilike('subject', subject).eq('grade', `${grade}. sınıf`)
        .or(`objective_code.ilike.%${escaped}%,title.ilike.%${escaped}%`).limit(50)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ candidates: data || [] })
    }
    if (!topic) return NextResponse.json({ candidates: [] })
    const { data, error } = await db.rpc('find_learning_objective_candidates_v2', {
      p_subject: subject, p_grade: `${grade}. sınıf`, p_topic: topic, p_limit: 50,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ candidates: data || [] })
  }
  const source = req.nextUrl.searchParams.get('source') === 'sessions' ? 'sessions' : 'bank'
  const reviewState = req.nextUrl.searchParams.get('reviewState')
  const status = reviewState === 'approved' || reviewState === 'rejected' ? reviewState : 'pending'
  const mappingStatus = status === 'approved' ? 'human_approved' : status === 'rejected' ? 'human_rejected' : null
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1))
  const subject = text(req.nextUrl.searchParams.get('subject'))
  const grade = text(req.nextUrl.searchParams.get('grade'))
  const start = (page - 1) * 20
  if (source === 'bank') {
    let query = db.from('question_bank').select('id,question,subject_key,topic_key,grade_key,updated_at', { count: 'exact' })
    if (mappingStatus) query = query.eq('question->>objectiveMappingStatus', mappingStatus)
    else query = query.or('question->>objectiveMappingStatus.is.null,question->>objectiveMappingStatus.not.in.(human_approved,human_rejected)')
    if (subject) query = query.eq('subject_key', subject)
    if (grade) query = query.eq('grade_key', grade)
    const { data, error, count } = await query.order('updated_at', { ascending: false }).range(start, start + 19)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: (data || []).map(row => ({ key: row.id, source: 'bank', recordId: row.id, index: null, question: row.question, subject: row.subject_key, grade: row.grade_key, topic: row.topic_key })), total: count || 0 })
  }
  // The review state belongs to each question, not its parent session. Scan the
  // completed sessions before paginating so a mixed-status session is handled correctly.
  const sessions: Array<{ id: string; questions: Question[]; topic: string; grade: string }> = []
  for (let offset = 0; ; offset += 200) {
    let query = db.from('quiz_sessions').select('id,questions,topic,grade,created_at').eq('completed', true)
    if (grade) query = query.ilike('grade', `%${gradeNumber(grade)}%`)
    const { data, error } = await query.order('created_at', { ascending: false }).range(offset, offset + 199)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    sessions.push(...(data || []))
    if (!data || data.length < 200) break
  }
  const matchingItems = sessions.flatMap(row => (Array.isArray(row.questions) ? row.questions : []).map((question: Question, index: number) => ({
    key: `${row.id}:${index}`, source: 'sessions', recordId: row.id, index, question,
    subject: text(question.subject), grade: row.grade, topic: row.topic,
  }))).filter(item => {
    const currentStatus = text(item.question.objectiveMappingStatus)
    return (!subject || item.subject === subject) && (mappingStatus ? currentStatus === mappingStatus : currentStatus !== 'human_approved' && currentStatus !== 'human_rejected')
  })
  return NextResponse.json({ items: matchingItems.slice(start, start + 20), total: matchingItems.length, pageUnit: 'soru' })
}

export async function POST(req: NextRequest) {
  const reviewer = await adminId()
  if (!reviewer) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { source?: string; recordId?: string; index?: number; objectiveId?: string | null; reason?: string }
  if (!uuid.test(body.recordId || '') || !['bank', 'sessions'].includes(body.source || '') || typeof body.reason !== 'string' || body.reason.trim().length < 3) {
    return NextResponse.json({ error: 'Kaynak, kayıt ve en az 3 karakterlik inceleme notu gerekli.' }, { status: 400 })
  }
  let objective: { id: string; objective_code: string; curriculum_version_id: string | null; current_revision_id: string | null; grade: string; subject: string } | null = null
  if (body.objectiveId) {
    if (!uuid.test(body.objectiveId)) return NextResponse.json({ error: 'Kazanım kimliği geçersiz.' }, { status: 400 })
    const result = await db.from('learning_objective_catalog').select('id,objective_code,curriculum_version_id,current_revision_id,grade,subject').eq('id', body.objectiveId).eq('is_active', true).eq('verification_status', 'verified').maybeSingle()
    if (result.error || !result.data) return NextResponse.json({ error: 'Aktif ve doğrulanmış kazanım bulunamadı.' }, { status: 400 })
    objective = result.data
  }
  if (body.source === 'bank') {
    const { data: row, error } = await db.from('question_bank').select('id,question,grade_key,subject_key').eq('id', body.recordId).maybeSingle()
    if (error || !row) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })
    if (objective && (gradeNumber(row.grade_key) !== gradeNumber(objective.grade) || row.subject_key.toLocaleLowerCase('tr-TR') !== objective.subject.toLocaleLowerCase('tr-TR'))) return NextResponse.json({ error: 'Sınıf veya ders kazanımla uyuşmuyor.' }, { status: 400 })
    const question = updateQuestion(row.question as Question, objective, reviewer, body.reason.trim())
    const saved = await db.from('question_bank').update({ question, updated_at: new Date().toISOString() }).eq('id', row.id).select('id').maybeSingle()
    if (saved.error || !saved.data) return NextResponse.json({ error: saved.error?.message || 'Kayıt güncellenemedi.' }, { status: 500 })
    return NextResponse.json({ success: true, updatedEvents: 0 })
  }
  if (!Number.isInteger(body.index) || body.index! < 0) return NextResponse.json({ error: 'Soru sırası geçersiz.' }, { status: 400 })
  const { data: row, error } = await db.from('quiz_sessions').select('id,questions,grade,topic,objective_mapped_count').eq('id', body.recordId).maybeSingle()
  if (error || !row || !Array.isArray(row.questions) || !row.questions[body.index!]) return NextResponse.json({ error: 'Test sorusu bulunamadı.' }, { status: 404 })
  const current = row.questions[body.index!] as Question
  if (objective && (gradeNumber(row.grade) !== gradeNumber(objective.grade) || text(current.subject).toLocaleLowerCase('tr-TR') !== objective.subject.toLocaleLowerCase('tr-TR'))) return NextResponse.json({ error: 'Sınıf veya ders kazanımla uyuşmuyor.' }, { status: 400 })
  const questions = [...row.questions]
  questions[body.index!] = updateQuestion(current, objective, reviewer, body.reason.trim())
  const mappedCount = questions.filter((q: Question) => text(q.learningObjectiveId)).length
  const saved = await db.from('quiz_sessions').update({ questions, objective_mapped_count: mappedCount, objective_mapping_version: 'human-review-v1' }).eq('id', row.id).select('id').maybeSingle()
  if (saved.error || !saved.data) return NextResponse.json({ error: saved.error?.message || 'Test güncellenemedi.' }, { status: 500 })
  const eventUpdate = await db.from('learning_events').update({ learning_objective_id: objective?.id || null }).eq('source_id', row.id).eq('source_type', 'quiz_session').eq('question_index', body.index!).select('id')
  if (eventUpdate.error) return NextResponse.json({ error: `Soru kaydedildi fakat öğrenme olayları güncellenemedi: ${eventUpdate.error.message}` }, { status: 500 })
  return NextResponse.json({ success: true, updatedEvents: eventUpdate.data?.length || 0 })
}
