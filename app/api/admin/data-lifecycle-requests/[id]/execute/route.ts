import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user: actor } } = await db.auth.getUser(token)
  if (!actor) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: adminProfile } = await db.from('profiles').select('is_admin').eq('id', actor.id).maybeSingle()
  if (adminProfile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { id } = await params
  const { data: request } = await db.from('data_lifecycle_requests').select('id,subject_user_id,status').eq('id', id).maybeSingle()
  if (!request || request.status !== 'in_progress') return NextResponse.json({ error: 'Talep ikinci onaydan geçmemiş.' }, { status: 409 })
  const { error: deleteError } = await db.auth.admin.deleteUser(request.subject_user_id)
  if (deleteError) return NextResponse.json({ error: 'Hesap silinemedi; talep tamamlanmadı.' }, { status: 502 })
  await db.from('data_lifecycle_requests').update({ status: 'completed', processed_by: actor.id, processed_at: new Date().toISOString(), verification_note: 'Hesap silme işlemi tamamlandı.' }).eq('id', id).eq('status', 'in_progress')
  return NextResponse.json({ ok: true, deletion_executed: true, request_id: id })
}
