// app/api/kvkk/data-request/route.ts (HİBRİT VERSİYON)
// Kimlik verisi TR-PG'den, platform verisi Supabase'den birleştirilerek sunulur.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exportIdentityData, deleteIdentity, recordKvkkRequest, getIdentityBySupabaseId } from '@/lib/identity/client'

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

// GET: Tüm verileri indir — TR-PG (kimlik) + Supabase (platform) birleşik
export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const [identityData, sessions, srCards, referrals, notifications] = await Promise.all([
    exportIdentityData(user.id),                                            // TR-PG
    supabaseAdmin.from('quiz_sessions').select('*').eq('user_id', user.id),  // Supabase
    supabaseAdmin.from('spaced_repetition_cards').select('*').eq('user_id', user.id),
    supabaseAdmin.from('referrals').select('*').eq('referrer_id', user.id),
    supabaseAdmin.from('notifications').select('*').eq('user_id', user.id),
  ])

  const exportData = {
    exported_at: new Date().toISOString(),
    kvkk_notice: 'Bu dosya KVKK m.11 kapsamındaki veri taşınabilirliği talebiniz üzerine oluşturulmuştur. Kimlik verileriniz Türkiye sunucusunda, platform kullanım verileriniz ayrı bir veritabanında saklanmaktadır.',
    identity: identityData?.identity ?? null,          // TR sunucusundan — kimlik
    consent_records: identityData?.consent_records ?? [], // TR sunucusundan
    quiz_sessions: sessions.data ?? [],                 // Supabase — platform verisi
    spaced_repetition_cards: srCards.data ?? [],
    referrals: referrals.data ?? [],
    notifications: notifications.data ?? [],
  }

  // İndirme talebini TR-PG'de logla
  if (identityData?.identity) {
    await recordKvkkRequest(identityData.identity.id, 'export', 'completed').catch(() => {})
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="pratium-verilerim-${user.id.slice(0, 8)}.json"`,
    },
  })
}

// DELETE: Hesabı ve TÜM verileri sil — hem TR-PG hem Supabase
export async function DELETE(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { confirm } = await req.json()
  if (confirm !== 'HESABIMI SIL') {
    return NextResponse.json({ error: 'Onay metni eşleşmiyor.' }, { status: 400 })
  }

  // Silme talebini TR-PG'de logla (silmeden ÖNCE, ispat için)
  const identity = await getIdentityBySupabaseId(user.id)
  if (identity) {
    await recordKvkkRequest(identity.id, 'deletion', 'completed').catch(() => {})
  }

  // 1) Supabase platform verilerini sil
  const tables = [
    'quiz_sessions', 'spaced_repetition_cards', 'notifications',
    'referrals', 'live_quiz_answers', 'ab_assignments', 'ab_events',
    'daily_challenges', 'streaks', 'institution_users', 'api_rate_limits',
  ]
  for (const t of tables) {
    await supabaseAdmin.from(t).delete().eq('user_id', user.id).then(() => {}, () => {})
  }
  await supabaseAdmin.from('referrals').delete().eq('referred_id', user.id).then(() => {}, () => {})
  await supabaseAdmin.from('profiles').delete().eq('id', user.id)

  // 2) Supabase Auth kullanıcısını sil
  await supabaseAdmin.auth.admin.deleteUser(user.id)

  // 3) TR-PG'deki kimlik kaydını sil (CASCADE ile consent_records, parent_child_links de gider)
  await deleteIdentity(user.id)

  return NextResponse.json({ success: true, message: 'Hesabınız ve tüm kişisel verileriniz (kimlik + platform verisi) silindi.' })
}
