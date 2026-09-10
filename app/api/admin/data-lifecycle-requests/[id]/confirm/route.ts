import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (profile?.is_admin !== true) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { confirm?: boolean; previewConfirmed?: boolean }
  if (body.confirm !== true || body.previewConfirmed !== true) return NextResponse.json({ error: 'Etki önizlemesi ve ikinci onay zorunludur.' }, { status: 400 })
  const { id } = await params
  const { data, error } = await db.from('data_lifecycle_requests').update({ status: 'in_progress', verification_note: 'Admin ikinci onayı ve dry-run kapsam doğrulaması alındı.', processed_by: user.id }).eq('id', id).eq('status', 'verified').select('id,status,subject_user_id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Onay kaydedilemedi.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Talep verified durumunda değil veya bulunamadı.' }, { status: 409 })
  return NextResponse.json({ request: data, dry_run: true, deletion_executed: false, next_step: 'backup_and_operator_approval' })
}
