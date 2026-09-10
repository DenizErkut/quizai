import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { id } = await params
  const { data: request } = await db.from('data_lifecycle_requests').select('id,subject_user_id,request_kind,scope,status').eq('id', id).maybeSingle()
  if (!request) return NextResponse.json({ error: 'Talep bulunamadı.' }, { status: 404 })
  const tables = ['profiles', 'quiz_sessions', 'learning_events', 'student_mastery', 'student_recommendations', 'parent_children'] as const
  const counts = await Promise.all(tables.map(async table => {
    const column = table === 'parent_children' ? 'child_id' : table === 'profiles' ? 'id' : table === 'student_recommendations' || table === 'student_mastery' || table === 'learning_events' || table === 'quiz_sessions' ? (table === 'learning_events' ? 'student_id' : 'user_id') : 'id'
    const { count } = await db.from(table).select('id', { count: 'exact', head: true }).eq(column, request.subject_user_id)
    return [table, count ?? 0]
  }))
  return NextResponse.json({ request, preview: Object.fromEntries(counts), deletion_executed: false })
}
