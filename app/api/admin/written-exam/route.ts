// Yönetici: yazılı soru setlerini listeler, kaydeder, yayınlar ve siler.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { parseResourceScope } from '@/lib/location/resource-scope'
import { validateQuestions, validateSlot } from '@/lib/written-exam'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAdmin(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 }) }
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!data?.is_admin) return { error: NextResponse.json({ error: 'Yönetici yetkisi gerekli.' }, { status: 403 }) }
  return { user }
}

const SET_COLUMNS = 'id,title,grade_number,subject,term,exam_number,country,state,city,status,total_points,source_note,created_at,updated_at'

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const [{ data: set }, { data: questions }] = await Promise.all([
      db.from('written_exam_sets').select(SET_COLUMNS).eq('id', id).maybeSingle(),
      db.from('written_exam_questions').select('position,title,objective_code,scenario,question,max_points,rubric,answer_key').eq('set_id', id).order('position'),
    ])
    if (!set) return NextResponse.json({ error: 'Set bulunamadı.' }, { status: 404 })
    return NextResponse.json({ set, questions: questions || [] })
  }
  const { data: sets, error } = await db.from('written_exam_sets').select(SET_COLUMNS)
    .order('grade_number').order('subject').order('term').order('exam_number')
  if (error) return NextResponse.json({ error: 'Setler okunamadı.' }, { status: 500 })
  const ids = (sets || []).map(set => set.id)
  const counts = new Map<string, number>()
  if (ids.length) {
    const { data: rows } = await db.from('written_exam_questions').select('set_id').in('set_id', ids)
    for (const row of rows || []) counts.set(row.set_id, (counts.get(row.set_id) || 0) + 1)
  }
  return NextResponse.json({ sets: (sets || []).map(set => ({ ...set, question_count: counts.get(set.id) || 0 })) })
}

type SaveBody = {
  id?: string; title?: string; gradeNumber?: unknown; subject?: unknown; term?: unknown; examNumber?: unknown
  country?: unknown; state?: unknown; city?: unknown; sourceNote?: string; publish?: boolean; questions?: unknown
}

// Kaydet (yeni set ya da mevcut setin tüm sorularını değiştirir). Aynı kapsam/sınıf/ders/dönem/yazılı için tek set vardır.
export async function POST(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const body = await req.json().catch(() => null) as SaveBody | null
  if (!body) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  const slot = validateSlot(body)
  if (slot.ok === false) return NextResponse.json({ error: slot.error }, { status: 400 })
  const scope = parseResourceScope(body)
  if (scope.ok === false) return NextResponse.json({ error: scope.error }, { status: 400 })
  const checked = validateQuestions(body.questions)
  if (checked.ok === false) return NextResponse.json({ error: checked.error }, { status: 400 })
  const title = (body.title || '').trim() || `${slot.value.gradeNumber}. sınıf ${slot.value.subject} ${slot.value.term}. dönem ${slot.value.examNumber}. yazılı`
  if (title.length < 3 || title.length > 200) return NextResponse.json({ error: 'Başlık 3-200 karakter olmalı.' }, { status: 400 })

  let query = db.from('written_exam_sets').select('id').eq('country', scope.value.country).eq('grade_number', slot.value.gradeNumber)
    .ilike('subject', slot.value.subject.replace(/[\\%_]/g, '\\$&')).eq('term', slot.value.term).eq('exam_number', slot.value.examNumber)
  query = scope.value.state ? query.eq('state', scope.value.state) : query.is('state', null)
  query = scope.value.city ? query.eq('city', scope.value.city) : query.is('city', null)
  const { data: existing } = await query.maybeSingle()
  if (existing && body.id && existing.id !== body.id) return NextResponse.json({ error: 'Bu sınıf/ders/dönem/yazılı için başka bir set zaten var; onu düzenleyin.' }, { status: 409 })
  const targetId = body.id || existing?.id

  const fields = {
    title, grade_number: slot.value.gradeNumber, subject: slot.value.subject, term: slot.value.term, exam_number: slot.value.examNumber,
    country: scope.value.country, state: scope.value.state, city: scope.value.city,
    status: body.publish ? 'published' : 'draft', total_points: checked.totalPoints,
    source_note: (body.sourceNote || '').trim().slice(0, 500) || null, updated_at: new Date().toISOString(),
  }
  let setId = targetId
  if (setId) {
    const { error } = await db.from('written_exam_sets').update(fields).eq('id', setId)
    if (error) return NextResponse.json({ error: 'Set güncellenemedi.' }, { status: 500 })
    const { error: delError } = await db.from('written_exam_questions').delete().eq('set_id', setId)
    if (delError) return NextResponse.json({ error: 'Eski sorular silinemedi.' }, { status: 500 })
  } else {
    const { data: created, error } = await db.from('written_exam_sets').insert({ ...fields, created_by: access.user.id }).select('id').single()
    if (error || !created) return NextResponse.json({ error: 'Set oluşturulamadı.' }, { status: 500 })
    setId = created.id
  }
  const rows = checked.questions.map(q => ({
    set_id: setId, position: q.position, title: q.title, objective_code: q.objectiveCode || null, scenario: q.scenario,
    question: q.question, max_points: q.maxPoints, rubric: q.rubric, answer_key: q.answerKey,
  }))
  const { error: insertError } = await db.from('written_exam_questions').insert(rows)
  if (insertError) {
    console.error('[written-exam] insert questions', insertError.message)
    return NextResponse.json({ error: 'Sorular kaydedilemedi; set taslak durumda kaldı.' }, { status: 500 })
  }
  return NextResponse.json({ id: setId, questionCount: rows.length, totalPoints: checked.totalPoints, status: fields.status })
}

// Yayınla / taslağa al.
export async function PATCH(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const body = await req.json().catch(() => null) as { id?: string; status?: string } | null
  if (!body?.id || (body.status !== 'published' && body.status !== 'draft')) return NextResponse.json({ error: 'id ve durum gerekli.' }, { status: 400 })
  const { error } = await db.from('written_exam_sets').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.id)
  if (error) return NextResponse.json({ error: 'Durum değiştirilemedi.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const body = await req.json().catch(() => null) as { id?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'id gerekli.' }, { status: 400 })
  const { error } = await db.from('written_exam_sets').delete().eq('id', body.id)
  if (error) return NextResponse.json({ error: 'Set silinemedi.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
