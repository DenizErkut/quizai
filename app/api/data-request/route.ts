// app/api/kvkk/data-request/route.ts
// KVKK m.11 — İlgili kişi hakları: veri indirme (taşınabilirlik) ve silme talebi
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  return user
}

// GET: Kullanıcının tüm verilerini JSON olarak indir (veri taşınabilirliği)
export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const [profile, sessions, srCards, referrals, notifications] = await Promise.all([
    supabaseAdmin.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabaseAdmin.from('quiz_sessions').select('*').eq('user_id', user.id),
    supabaseAdmin.from('spaced_repetition_cards').select('*').eq('user_id', user.id),
    supabaseAdmin.from('referrals').select('*').eq('referrer_id', user.id),
    supabaseAdmin.from('notifications').select('*').eq('user_id', user.id),
  ])

  const exportData = {
    exported_at: new Date().toISOString(),
    kvkk_notice: 'Bu dosya KVKK m.11 kapsamındaki veri taşınabilirliği talebiniz üzerine oluşturulmuştur.',
    profile: profile.data,
    quiz_sessions: sessions.data ?? [],
    spaced_repetition_cards: srCards.data ?? [],
    referrals: referrals.data ?? [],
    notifications: notifications.data ?? [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="pratium-verilerim-${user.id.slice(0, 8)}.json"`,
    },
  })
}

// DELETE: Hesap ve tüm kişisel verilerin silinmesi talebi (KVKK m.7 + m.11/1-e)
export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  // Deprecated compatibility route: never delete inline; enqueue the controlled admin workflow.
  const { data: existing } = await supabaseAdmin.from('data_lifecycle_requests')
    .select('id,status').eq('requested_by', user.id).eq('subject_user_id', user.id)
    .eq('request_kind', 'deletion').in('status', ['pending', 'verified', 'in_progress']).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Zaten açık bir silme talebiniz var.', request: existing }, { status: 409 })
  const { data, error } = await supabaseAdmin.from('data_lifecycle_requests').insert({
    requested_by: user.id, subject_user_id: user.id, request_kind: 'deletion', scope: 'all_student_data',
  }).select('id,status,created_at').single()
  if (error) return NextResponse.json({ error: 'Silme talebi oluşturulamadı.' }, { status: 500 })
  return NextResponse.json({ request: data, deletion_executed: false }, { status: 202 })
}
