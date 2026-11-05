// Öğretmen: yöneticinin yüklediği senaryo serisini (ders · dönem · senaryo no; çok soru, şekil, doldurulabilir tablo) sınıfa ödev olarak atar.
//   GET  ?classroom_id=…  → sınıfın seviyesine uygun yayınlanmış senaryolar
//   POST {classroom_id, subject, term, scenarioNo, title?, due_date?} → senaryonun her sorusu bir ödev (ortak batch_id) olarak kaydedilir
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { gradeNumberOf } from '@/lib/written-exam'
import { DEFAULT_COUNTRY } from '@/lib/location/resource-scope'
import { scenarioLabel } from '@/lib/open-ended-scenarios'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function authorize(req: NextRequest, classroomId: unknown) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return { error: NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 }) }
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { error: NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 }) }
  const { data: teacher } = await db.from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return { error: NextResponse.json({ error: 'Onaylı öğretmen hesabı gerekir.' }, { status: 403 }) }
  if (typeof classroomId !== 'string' || !classroomId) return { error: NextResponse.json({ error: 'Sınıf seçin.' }, { status: 400 }) }
  const { data: classroom } = await db.from('classrooms').select('id, teacher_id, grade, name').eq('id', classroomId).maybeSingle()
  if (!classroom || classroom.teacher_id !== teacher.id) return { error: NextResponse.json({ error: 'Bu sınıf size ait değil.' }, { status: 403 }) }
  return { teacher, classroom }
}

// Sınıf seviyesi: sınıf kaydı → sınıf adı ("7-D" → 7) → öğrencilerin çoğunluğu → öğretmenin elle seçtiği seviye.
async function resolveGradeNumber(classroom: { id: string; grade: string | null; name: string | null }, override?: unknown): Promise<number | null> {
  const manual = Number(override)
  if (Number.isInteger(manual) && manual >= 1 && manual <= 12) return manual
  const fromGrade = gradeNumberOf(classroom.grade)
  if (fromGrade) return fromGrade
  const fromName = /^\s*(\d{1,2})(?!\d)/.exec(classroom.name || '')
  if (fromName && Number(fromName[1]) >= 1 && Number(fromName[1]) <= 12) return Number(fromName[1])
  const { data: members } = await db.from('classroom_students').select('student_id').eq('classroom_id', classroom.id).limit(200)
  const ids = (members || []).map(m => m.student_id as string)
  if (!ids.length) return null
  const { data: profiles } = await db.from('profiles').select('grade').in('id', ids)
  const counts = new Map<number, number>()
  for (const row of profiles || []) { const n = gradeNumberOf(row.grade); if (n) counts.set(n, (counts.get(n) || 0) + 1) }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req, req.nextUrl.searchParams.get('classroom_id'))
  if ('error' in auth) return auth.error
  const gradeNumber = await resolveGradeNumber(auth.classroom, req.nextUrl.searchParams.get('grade_number'))
  if (!gradeNumber) return NextResponse.json({ scenarios: [], needsGrade: true })
  const { data } = await db.from('open_ended_scenario_examples').select('subject,term,scenario_no')
    .eq('status', 'published').eq('grade_number', gradeNumber).eq('country', DEFAULT_COUNTRY).limit(2000)
  const map = new Map<string, { subject: string; term: number; scenarioNo: number; questionCount: number }>()
  for (const row of data || []) {
    const key = `${row.subject.toLocaleLowerCase('tr')}|${row.term}|${row.scenario_no}`
    const entry = map.get(key)
    if (entry) entry.questionCount++
    else map.set(key, { subject: row.subject, term: row.term, scenarioNo: row.scenario_no, questionCount: 1 })
  }
  const scenarios = [...map.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'tr') || a.term - b.term || a.scenarioNo - b.scenarioNo)
  return NextResponse.json({ scenarios, gradeNumber })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { classroom_id?: string; subject?: string; term?: number; scenarioNo?: number; title?: string; due_date?: string; grade_number?: number } | null
  if (!body) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  const auth = await authorize(req, body.classroom_id)
  if ('error' in auth) return auth.error
  const subject = String(body.subject || '').trim()
  const term = Number(body.term), scenarioNo = Number(body.scenarioNo)
  if (!subject || (term !== 1 && term !== 2) || !Number.isInteger(scenarioNo) || scenarioNo < 1 || scenarioNo > 99) return NextResponse.json({ error: 'Ders, dönem ve senaryo seçin.' }, { status: 400 })
  const gradeNumber = await resolveGradeNumber(auth.classroom, body.grade_number)
  if (!gradeNumber) return NextResponse.json({ error: 'Sınıfın seviyesi belirlenemedi; sınıf düzeyini seçin.' }, { status: 400 })

  const { data: examples } = await db.from('open_ended_scenario_examples')
    .select('scenario,question,rubric,figure_svg,figure_image,answer_table,seq,created_at')
    .eq('status', 'published').eq('grade_number', gradeNumber).eq('country', DEFAULT_COUNTRY).eq('term', term).eq('scenario_no', scenarioNo)
    .ilike('subject', subject.replace(/[\\%_]/g, '\\$&')).order('seq').order('created_at').limit(30)
  if (!examples?.length) return NextResponse.json({ error: 'Bu senaryo için yayınlanmış soru yok.' }, { status: 404 })

  const label = scenarioLabel(term, scenarioNo)
  const title = (body.title || '').trim() || `${subject} · ${label}`
  const batchId = crypto.randomUUID()
  const { data: created, error } = await db.from('open_ended_assignments').insert(examples.map((example, index) => ({
    teacher_id: auth.teacher.id, classroom_id: auth.classroom.id,
    title: examples.length > 1 ? `${title} — Soru ${index + 1}/${examples.length}` : title,
    grade: auth.classroom.grade || `${gradeNumber}. sınıf`, subject, topic: label,
    scenario: example.scenario, question: example.question, rubric: example.rubric,
    figure_svg: example.figure_svg || null, figure_image: example.figure_image || null, answer_table: example.answer_table || null,
    created_via: 'scenario', due_date: body.due_date || null, verified: true, batch_id: batchId, batch_index: index,
  }))).select('*, classrooms(name)')
  if (error || !created) {
    console.error('[assign-scenario] kayıt hatası:', error?.message)
    return NextResponse.json({ error: 'Ödevler kaydedilemedi.' }, { status: 500 })
  }
  return NextResponse.json({ assignments: created })
}
