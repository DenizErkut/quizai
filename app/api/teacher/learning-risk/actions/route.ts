import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { studentInTeacherClassrooms, teacherOwnsClassroom } from '@/lib/teacher-scope'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function teacherFor(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: teacher } = await db.from('teachers').select('id,approved').eq('user_id', user.id).maybeSingle()
  return teacher?.approved ? teacher : null
}

export async function GET(req: NextRequest) {
  const teacher = await teacherFor(req)
  if (!teacher) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const { data, error } = await db.from('learning_risk_actions').select('id,student_id,classroom_id,subject,topic,action,status,created_at,completed_at').eq('teacher_id', teacher.id).order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: 'Aksiyonlar alınamadı.' }, { status: 500 })
  return NextResponse.json({ actions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const teacher = await teacherFor(req)
  if (!teacher) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const { action, student_id, classroom_id, subject, topic } = body ?? {}
  if (!student_id || !topic || !['acknowledge', 'assign', 'notify', 'resolve'].includes(action)) return NextResponse.json({ error: 'Geçersiz risk aksiyonu.' }, { status: 400 })

  // classroom_id verilmese de öğrenci öğretmenin kendi sınıflarından birinde olmalı (başka öğrenciye bildirim/aksiyon yazılamaz).
  if (classroom_id && !(await teacherOwnsClassroom(db, teacher.id, classroom_id))) return NextResponse.json({ error: 'Sınıf erişimi yok.' }, { status: 403 })
  if (!(await studentInTeacherClassrooms(db, teacher.id, student_id, classroom_id || null))) return NextResponse.json({ error: 'Öğrenci bu sınıfta değil.' }, { status: 403 })

  const completed = action === 'resolve'
  const { data: record, error } = await db.from('learning_risk_actions').insert({ teacher_id: teacher.id, student_id, classroom_id: classroom_id || null, subject: subject || 'Genel', topic, action, status: completed ? 'completed' : 'open', completed_at: completed ? new Date().toISOString() : null }).select().single()
  if (error) return NextResponse.json({ error: 'Risk aksiyonu kaydedilemedi.' }, { status: 500 })

  if (action === 'notify') {
    await db.from('notifications').insert({ user_id: student_id, type: 'teacher_message', title: '📚 Öğretmeninizden çalışma önerisi', body: `${topic} konusunda kısa bir tekrar yapman öneriliyor.`, read: false, data: { source: 'learning_risk', topic, classroom_id: classroom_id || null } })
  }
  return NextResponse.json({ action: record })
}
