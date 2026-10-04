import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, supabaseAdmin } from '@/lib/auth-middleware'

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { data: parent } = await supabaseAdmin.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
  if (parent?.role !== 'parent') {
    return NextResponse.json({ error: 'Bu işlem yalnızca veli hesapları içindir.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const childId = typeof body?.childId === 'string' ? body.childId : ''
  if (!/^[0-9a-f-]{36}$/i.test(childId)) {
    return NextResponse.json({ error: 'Geçersiz öğrenci kimliği.' }, { status: 400 })
  }

  const { data: link, error: lookupError } = await supabaseAdmin
    .from('parent_children')
    .select('parent_id, child_id')
    .eq('parent_id', auth.user.id)
    .eq('child_id', childId)
    .maybeSingle()
  if (lookupError) return NextResponse.json({ error: 'Bağlantı doğrulanamadı.' }, { status: 500 })
  if (!link) return NextResponse.json({ error: 'Bu öğrenci bağlantısı bulunamadı.' }, { status: 404 })

  const { error } = await supabaseAdmin.from('parent_children').delete()
    .eq('parent_id', auth.user.id).eq('child_id', childId)
  if (error) return NextResponse.json({ error: 'Bağlantı kaldırılamadı.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
