import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: teacher } = await db.from('teachers').select('id,approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const { data: classes } = await db.from('classrooms').select('id').eq('teacher_id', teacher.id)
  const { data: members } = classes?.length ? await db.from('classroom_students').select('student_id').in('classroom_id', classes.map(c => c.id)) : { data: [] }
  const ids = [...new Set((members ?? []).map(m => m.student_id))]
  if (!ids.length) return NextResponse.json({ students: 0, topics: [], recommendationCount: 0 })
  const [mastery, recommendations] = await Promise.all([
    db.from('student_mastery').select('subject,topic,mastery_score,retention_score,student_id').in('student_id', ids).eq('learning_objective_key', ''),
    db.from('student_recommendations').select('subject,topic,status').in('student_id', ids).in('status', ['active','accepted']),
  ])
  if (mastery.error || recommendations.error) return NextResponse.json({ error: 'Öğretmen özeti alınamadı.' }, { status: 500 })
  const byTopic = new Map<string, { subject: string; topic: string; mastery: number; retention: number; count: number }>()
  for (const row of mastery.data ?? []) {
    const key = `${row.subject}::${row.topic}`; const current = byTopic.get(key)
    if (current) { current.mastery += Number(row.mastery_score); current.retention += Number(row.retention_score); current.count++ }
    else byTopic.set(key, { subject: row.subject, topic: row.topic, mastery: Number(row.mastery_score), retention: Number(row.retention_score), count: 1 })
  }
  const topics = [...byTopic.values()].map(row => ({ ...row, mastery: Math.round(row.mastery / row.count), retention: Math.round(row.retention / row.count) }))
    .sort((a, b) => a.mastery - b.mastery).slice(0, 5)
  return NextResponse.json({ students: ids.length, topics, recommendationCount: recommendations.data?.length ?? 0 })
}
