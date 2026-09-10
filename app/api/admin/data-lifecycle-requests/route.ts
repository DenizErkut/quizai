import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function admin(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return data?.is_admin === true ? user : null
}

export async function GET(req: NextRequest) {
  if (!await admin(req)) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const status = req.nextUrl.searchParams.get('status')
  const query = db.from('data_lifecycle_requests').select('id, requested_by, subject_user_id, request_kind, scope, status, verification_note, processed_by, processed_at, created_at').order('created_at', { ascending: false }).limit(200)
  const { data, error } = status ? await query.eq('status', status) : await query
  if (error) return NextResponse.json({ error: 'Talepler alınamadı.' }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const actor = await admin(req)
  if (!actor) return NextResponse.json({ error: 'Yasak.' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { id?: string; status?: string; note?: string }
  if (!body.id || !['verified', 'in_progress', 'completed', 'rejected'].includes(body.status || '')) return NextResponse.json({ error: 'Geçersiz durum geçişi.' }, { status: 400 })
  const update: Record<string, unknown> = { status: body.status, verification_note: typeof body.note === 'string' ? body.note.trim().slice(0, 500) : null }
  if (body.status === 'completed' || body.status === 'rejected') { update.processed_by = actor.id; update.processed_at = new Date().toISOString() }
  const { data, error } = await db.from('data_lifecycle_requests').update(update).eq('id', body.id).in('status', ['pending', 'verified', 'in_progress']).select('id,status,processed_by,processed_at').maybeSingle()
  if (error) return NextResponse.json({ error: 'Talep güncellenemedi.' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Talep bulunamadı veya geçiş artık uygulanamıyor.' }, { status: 409 })
  return NextResponse.json({ request: data, deletion_executed: false })
}
