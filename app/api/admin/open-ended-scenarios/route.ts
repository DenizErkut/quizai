// Yönetici: Açık Uçlu senaryo örneklerini (sınıf/ders/dönem/senaryo no) listeler, kaydeder, yayınlar ve siler.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { parseResourceScope } from '@/lib/location/resource-scope'
import { validateScenarioExample } from '@/lib/open-ended-scenarios'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAdmin(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return { error: NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 }) }
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!data?.is_admin) return { error: NextResponse.json({ error: 'Yönetici yetkisi gerekli.' }, { status: 403 }) }
  return { user }
}

const COLUMNS = 'id,grade_number,subject,term,scenario_no,title,scenario,question,rubric,figure_svg,figure_image,answer_table,seq,country,status,source_note,created_at,updated_at'

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const params = req.nextUrl.searchParams
  let query = db.from('open_ended_scenario_examples').select(COLUMNS)
  const grade = Number(params.get('grade'))
  if (Number.isInteger(grade) && grade >= 1 && grade <= 12) query = query.eq('grade_number', grade)
  const subject = (params.get('subject') || '').trim()
  if (subject) query = query.ilike('subject', subject.replace(/[\\%_]/g, '\\$&'))
  const term = Number(params.get('term'))
  if (term === 1 || term === 2) query = query.eq('term', term)
  const { data, error } = await query.order('grade_number').order('subject').order('term').order('scenario_no').order('seq').order('created_at').limit(500)
  if (error) return NextResponse.json({ error: 'Örnekler okunamadı.' }, { status: 500 })
  return NextResponse.json({ examples: data || [] })
}

// Kaydet: id verilirse günceller, yoksa ekler. Aynı senaryo numarasına birden fazla örnek eklenebilir.
export async function POST(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const body = await req.json().catch(() => null) as (Record<string, unknown> & { id?: string; publish?: boolean; sourceNote?: string }) | null
  if (!body) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  const checked = validateScenarioExample(body)
  if (checked.ok === false) return NextResponse.json({ error: checked.error }, { status: 400 })
  const scope = parseResourceScope({ country: body.country || 'TR' })
  if (scope.ok === false) return NextResponse.json({ error: scope.error }, { status: 400 })
  const v = checked.value
  const fields = {
    grade_number: v.gradeNumber, subject: v.subject, term: v.term, scenario_no: v.scenarioNo, title: v.title,
    scenario: v.scenario, question: v.question, rubric: v.rubric, figure_svg: v.figureSvg || null, figure_image: v.figureImage || null, answer_table: v.answerTable || null, country: scope.value.country,
    status: body.publish ? 'published' : 'draft', source_note: (body.sourceNote || '').trim().slice(0, 500) || null,
    updated_at: new Date().toISOString(),
  }
  if (body.id) {
    const { error } = await db.from('open_ended_scenario_examples').update(fields).eq('id', body.id)
    if (error) return NextResponse.json({ error: 'Örnek güncellenemedi.' }, { status: 500 })
    return NextResponse.json({ id: body.id, status: fields.status })
  }
  // Yeni soru, aynı senaryonun (sınıf+ders+dönem+no) sonuna eklenir.
  const { data: last } = await db.from('open_ended_scenario_examples').select('seq').eq('grade_number', v.gradeNumber).eq('country', scope.value.country).eq('term', v.term).eq('scenario_no', v.scenarioNo).ilike('subject', v.subject.replace(/[\\%_]/g, '\\$&')).order('seq', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from('open_ended_scenario_examples').insert({ ...fields, seq: (last?.seq ?? 0) + 1, created_by: access.user.id }).select('id').single()
  if (error || !data) return NextResponse.json({ error: 'Örnek kaydedilemedi.' }, { status: 500 })
  return NextResponse.json({ id: data.id, status: fields.status })
}

export async function PATCH(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const body = await req.json().catch(() => null) as { id?: string; status?: string } | null
  if (!body?.id || (body.status !== 'published' && body.status !== 'draft')) return NextResponse.json({ error: 'id ve durum gerekli.' }, { status: 400 })
  const { error } = await db.from('open_ended_scenario_examples').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.id)
  if (error) return NextResponse.json({ error: 'Durum değiştirilemedi.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const access = await requireAdmin(req)
  if (access.error) return access.error
  const body = await req.json().catch(() => null) as { id?: string } | null
  if (!body?.id) return NextResponse.json({ error: 'id gerekli.' }, { status: 400 })
  const { error } = await db.from('open_ended_scenario_examples').delete().eq('id', body.id)
  if (error) return NextResponse.json({ error: 'Örnek silinemedi.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
