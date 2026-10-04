import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { lifecycleTables, lifecycleOwnerColumn } from '@/lib/data-lifecycle-scope'
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
  const counts = await Promise.all(lifecycleTables.map(async table => {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true }).eq(lifecycleOwnerColumn(table), request.subject_user_id)
    return { table, count, error }
  }))
  if (counts.some(result => result.error)) {
    console.error('[data-lifecycle] preview count failed', counts.filter(result => result.error).map(result => result.table))
    return NextResponse.json({ error: 'Kayıt sayıları doğrulanamadı. Lütfen yeniden deneyin.' }, { status: 500 })
  }
  return NextResponse.json({ request, preview: Object.fromEntries(counts.map(result => [result.table, result.count ?? 0])), deletion_executed: false })
}
