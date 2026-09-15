import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })

  const since = new Date(); since.setUTCDate(since.getUTCDate() - 35)
  const [{ data: rows, error }, { data: streaks }] = await Promise.all([
    db.from('daily_challenges').select('user_id,date,completed,bank_question_count,generated_question_count,completed_at').gte('date', since.toISOString().slice(0, 10)).order('date'),
    db.from('streaks').select('current_streak,longest_streak'),
  ])
  if (error) return NextResponse.json({ error: 'Günlük görev verileri alınamadı.' }, { status: 500 })

  const all = rows || []
  const completed = all.filter((row: any) => row.completed)
  const byUser = new Map<string, Set<string>>()
  for (const row of completed) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, new Set())
    byUser.get(row.user_id)!.add(row.date)
  }
  let eligibleD1 = 0, returnedD1 = 0, eligibleD7 = 0, returnedD7 = 0
  const today = new Date().toISOString().slice(0, 10)
  for (const dates of byUser.values()) {
    const ordered = [...dates].sort()
    const first = ordered[0]
    const firstDate = new Date(`${first}T00:00:00Z`)
    const d1 = new Date(firstDate); d1.setUTCDate(d1.getUTCDate() + 1)
    const d7 = new Date(firstDate); d7.setUTCDate(d7.getUTCDate() + 7)
    const d1Key = d1.toISOString().slice(0, 10)
    if (d1Key <= today) { eligibleD1++; if (dates.has(d1Key)) returnedD1++ }
    if (d7.toISOString().slice(0, 10) <= today) {
      eligibleD7++
      if (ordered.some(date => date > first && date <= d7.toISOString().slice(0, 10))) returnedD7++
    }
  }
  const sum = (key: string) => all.reduce((total: number, row: any) => total + Number(row[key] || 0), 0)
  const streakRows = streaks || []
  return NextResponse.json({
    assigned: all.length, completed: completed.length, students: byUser.size,
    completion_rate: all.length ? completed.length / all.length : 0,
    d1_return_rate: eligibleD1 ? returnedD1 / eligibleD1 : null,
    d7_return_rate: eligibleD7 ? returnedD7 / eligibleD7 : null,
    avg_current_streak: streakRows.length ? streakRows.reduce((s: number, r: any) => s + Number(r.current_streak || 0), 0) / streakRows.length : 0,
    avg_bank_questions: all.length ? sum('bank_question_count') / all.length : 0,
    avg_generated_questions: all.length ? sum('generated_question_count') / all.length : 0,
    window_days: 35,
  })
}
