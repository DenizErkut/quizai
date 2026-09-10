import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { calculateLearningRisk } from '@/lib/predictive-learning-v1'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data, error } = await db
    .from('student_mastery')
    .select('subject,topic,mastery_score,confidence_score,retention_score,attempt_count,trend,last_practiced_at')
    .eq('student_id', user.id)
    .gte('attempt_count', 3)
    .gte('confidence_score', 0.3)
    .order('last_mastery_update', { ascending: false })
    .limit(100)
  if (error) return NextResponse.json({ error: 'Risk verisi alınamadı.' }, { status: 500 })
  const risks = (data ?? [])
    .map(row => ({
      subject: row.subject,
      topic: row.topic,
      mastery: Number(row.mastery_score),
      retention: Number(row.retention_score),
      confidence: Number(row.confidence_score),
      attempt_count: row.attempt_count,
      ...calculateLearningRisk({
        mastery: Number(row.mastery_score),
        retention: Number(row.retention_score),
        trend: row.trend,
        lastPracticedAt: row.last_practiced_at,
      }),
    }))
    .filter(risk => risk.level !== 'low')
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
  return NextResponse.json({ risks, policy_version: 'predictive-learning-v1', generated_at: new Date().toISOString() })
}
