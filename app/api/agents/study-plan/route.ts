import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Read-only study-plan agent. It never mutates grades, mastery, assignments or recommendations. */
export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { timeBudgetMinutes?: number; examAt?: string }
  const budget = Math.min(Math.max(Number(body.timeBudgetMinutes) || 20, 5), 120)
  const examAt = typeof body.examAt === 'string' && !Number.isNaN(Date.parse(body.examAt)) ? body.examAt : null

  const { data, error } = await db.rpc('get_student_recommendations_priority_v2', {
    p_student_id: user.id,
    p_time_budget_minutes: budget,
    p_next_exam_at: examAt,
  })
  if (error) return NextResponse.json({ error: 'Çalışma planı oluşturulamadı.' }, { status: 500 })

  const items = (data ?? []).slice(0, 5).map((item: Record<string, unknown>, index: number) => ({
    order: index + 1,
    recommendation_id: item.id,
    subject: item.subject,
    topic: item.topic,
    reason: item.reason,
    estimated_minutes: Math.min(15, Math.max(5, Math.round(budget / Math.max(1, Math.min(3, (data ?? []).length))))),
    status: item.status,
  }))

  return NextResponse.json({
    plan: items,
    agent: 'study-plan-v1',
    mode: 'read_only',
    policy: 'No grades, mastery, assignments or curriculum changes are permitted.',
  })
}
