// app/api/kvkk/data-request/route.ts (HİBRİT VERSİYON)
// Kimlik verisi TR-PG'den, platform verisi Supabase'den birleştirilerek sunulur.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { exportIdentityData, recordKvkkRequest } from '@/lib/identity/client'

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
  const { data: existing } = await supabaseAdmin.from('data_lifecycle_requests').select('id,status')
    .eq('requested_by', user.id).eq('subject_user_id', user.id).eq('request_kind', 'deletion')
    .in('status', ['pending', 'verified', 'in_progress']).maybeSingle()
  if (existing) return NextResponse.json({ error: 'Zaten açık bir silme talebiniz var.', request: existing }, { status: 409 })
  const { data, error } = await supabaseAdmin.from('data_lifecycle_requests').insert({
    requested_by: user.id, subject_user_id: user.id, request_kind: 'deletion', scope: 'all_student_data',
  }).select('id,status,created_at').single()
  if (error) return NextResponse.json({ error: 'Silme talebi oluşturulamadı.' }, { status: 500 })
  return NextResponse.json({ request: data, deletion_executed: false }, { status: 202 })
}
