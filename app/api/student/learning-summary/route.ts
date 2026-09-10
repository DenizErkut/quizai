import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user }, error: authError } = await db.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const [mastery, misconceptions, events] = await Promise.all([
    db.from('student_mastery').select('subject,topic,mastery_score,retention_score,trend,last_practiced_at')
      .eq('student_id', user.id).eq('learning_objective_key', '').order('mastery_score', { ascending: true }).limit(5),
    db.from('student_misconceptions').select('subject,topic,misconception_id,confidence_score,status,last_seen_at')
      .eq('student_id', user.id).eq('status', 'confirmed').order('last_seen_at', { ascending: false }).limit(5),
    db.from('recommendation_lifecycle_events').select('recommendation_id,previous_status,new_status,reason,created_at')
      .eq('student_id', user.id).order('created_at', { ascending: false }).limit(8),
  ])
  const error = mastery.error || misconceptions.error || events.error
  if (error) return NextResponse.json({ error: 'Öğrenme özeti alınamadı.' }, { status: 500 })
  return NextResponse.json({ mastery: mastery.data ?? [], misconceptions: misconceptions.data ?? [], recommendationHistory: events.data ?? [] })
}
