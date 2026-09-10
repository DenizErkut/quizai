import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user }, error: authError } = await db.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const budgetValue = Number(req.nextUrl.searchParams.get('time_budget_minutes'))
  const budget = Number.isFinite(budgetValue) ? Math.min(Math.max(Math.round(budgetValue), 5), 240) : null
  const exam = req.nextUrl.searchParams.get('next_exam_at')
  const { data, error } = await db.rpc('get_student_recommendations_priority_v2', {
    p_student_id: user.id, p_time_budget_minutes: budget, p_next_exam_at: exam || null,
  })
  if (error) return NextResponse.json({ error: 'Öncelikli öneriler alınamadı.' }, { status: 500 })
  return NextResponse.json({ recommendations: data ?? [], ranking_version: 'recommendation-priority-v2' })
}
