// Öğrencinin senaryo serisinden çıkan soruları ("Çözülenler" paneli): liste ve tek soru ayrıntısı.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
    const { data } = await db.from('open_ended_sessions').select('id,subject,topic,question_index,scenario,question,rubric,figure_svg,answer_table,total_possible,total_earned,graded_at,source,created_at,student_answer,criteria_results,overall_feedback')
      .eq('id', id).eq('user_id', user.id).maybeSingle()
    if (!data) return NextResponse.json({ error: 'Soru bulunamadı.' }, { status: 404 })
    return NextResponse.json({ session: data })
  }
  const since = new Date(Date.now() - 365 * 24 * 3600_000).toISOString()
  const { data } = await db.from('open_ended_sessions').select('id,subject,topic,question_index,total_earned,total_possible,graded_at,source,created_at')
    .eq('user_id', user.id).not('question_index', 'is', null).gte('created_at', since).order('created_at', { ascending: false }).limit(400)
  return NextResponse.json({ sessions: data || [] })
}
