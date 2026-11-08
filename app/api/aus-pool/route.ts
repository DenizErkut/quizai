// AUS soru havuzu incelemesi: yönetici ya da onaylı öğretmen bekleyen soruları onaylar/reddeder.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function reviewer(req: NextRequest): Promise<{ id: string; role: 'admin' | 'teacher' } | null> {
  const user = await getAuthedUser(req)
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin) return { id: user.id, role: 'admin' }
  const { data: teacher } = await db.from('teachers').select('approved').eq('user_id', user.id).maybeSingle()
  return teacher?.approved === true ? { id: user.id, role: 'teacher' } : null
}

const COLUMNS = 'id,source,grade,subject,topic,scenario,question,rubric,figure_svg,answer_table,status,reviewed_by_role,reviewed_at,review_note,created_at'

export async function GET(req: NextRequest) {
  const who = await reviewer(req)
  if (!who) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const params = req.nextUrl.searchParams
  const status = ['pending', 'approved', 'rejected'].includes(params.get('status') || '') ? params.get('status')! : 'pending'
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1))
  const size = 20
  let query = db.from('open_ended_question_pool').select(COLUMNS, { count: 'exact' }).eq('status', status)
  const subject = (params.get('subject') || '').trim()
  if (subject) query = query.ilike('subject', subject.replace(/[\\%_]/g, '\\$&'))
  const source = params.get('source')
  if (source === 'student_ai' || source === 'teacher_assignment') query = query.eq('source', source)
  const { data, count, error } = await query.order('created_at', { ascending: false }).range((page - 1) * size, page * size - 1)
  if (error) return NextResponse.json({ error: 'Liste alınamadı.' }, { status: 500 })
  const countFor = async (value: string) => (await db.from('open_ended_question_pool').select('id', { count: 'exact', head: true }).eq('status', value)).count || 0
  const [pending, approved, rejected] = await Promise.all([countFor('pending'), countFor('approved'), countFor('rejected')])
  const { data: subjects } = await db.from('open_ended_question_pool').select('subject').not('subject', 'is', null).limit(2000)
  return NextResponse.json({
    items: data || [], total: count || 0, page, pageSize: size, counts: { pending, approved, rejected }, role: who.role,
    subjects: [...new Set((subjects || []).map(row => String(row.subject)))].sort((a, b) => a.localeCompare(b, 'tr')),
  })
}

export async function POST(req: NextRequest) {
  const who = await reviewer(req)
  if (!who) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const body = await req.json().catch(() => null) as { id?: string; decision?: string; note?: string } | null
  if (!body?.id || !/^[0-9a-f-]{36}$/i.test(body.id) || !['approved', 'rejected', 'pending'].includes(String(body.decision))) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : ''
  const { data, error } = await db.from('open_ended_question_pool').update({
    status: body.decision, reviewed_by: body.decision === 'pending' ? null : who.id, reviewed_by_role: body.decision === 'pending' ? null : who.role,
    reviewed_at: body.decision === 'pending' ? null : new Date().toISOString(), review_note: note || null,
  }).eq('id', body.id).select('id,status').maybeSingle()
  if (error || !data) return NextResponse.json({ error: 'Karar kaydedilemedi.' }, { status: 500 })
  return NextResponse.json({ ok: true, status: data.status })
}
