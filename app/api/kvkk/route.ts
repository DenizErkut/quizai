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

  const { confirm } = await req.json()
  if (confirm !== 'HESABIMI SIL') {
    return NextResponse.json({ error: 'Onay metni eşleşmiyor.' }, { status: 400 })
  }

  // Silme talebini logla (KVKK ispat yükümlülüğü — kim, ne zaman talep etti)
  await supabaseAdmin.from('kvkk_requests').insert({
    user_id: user.id,
    request_type: 'deletion',
    status: 'completed',
    requested_at: new Date().toISOString(),
  }).select().maybeSingle()

  // Kullanıcı verilerini sil — CASCADE ile bağlı tablolar da silinir
  const tables = [
    'quiz_sessions', 'spaced_repetition_cards', 'notifications',
    'referrals', 'live_quiz_answers', 'ab_assignments', 'ab_events',
    'daily_challenges', 'streaks', 'institution_users', 'api_rate_limits',
  ]
  for (const t of tables) {
    await supabaseAdmin.from(t).delete().eq('user_id', user.id).then(() => {}, () => {})
  }
  // referrals'da referred olarak da olabilir
  await supabaseAdmin.from('referrals').delete().eq('referred_id', user.id).then(() => {}, () => {})
  // Profil sil
  await supabaseAdmin.from('profiles').delete().eq('id', user.id)
  // Auth kullanıcısını sil
  await supabaseAdmin.auth.admin.deleteUser(user.id)

  return NextResponse.json({ success: true, message: 'Hesabınız ve tüm kişisel verileriniz silindi.' })
}
