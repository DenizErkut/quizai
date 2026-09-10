import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export async function POST(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  const { data: existing } = await db.from('data_lifecycle_requests').select('id,status').eq('requested_by', user.id).eq('subject_user_id', user.id).eq('request_kind', 'deletion').in('status', ['pending', 'verified', 'in_progress']).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Zaten açık bir silme talebiniz var.', request: existing }, { status: 409 })
  const { data, error } = await db.from('data_lifecycle_requests').insert({ requested_by: user.id, subject_user_id: user.id, request_kind: 'deletion', scope: 'all_student_data' }).select('id,status,created_at').single()
  if (error) return NextResponse.json({ error: 'Talep oluşturulamadı.' }, { status: 500 })
  return NextResponse.json({ request: data }, { status: 201 })
}
