import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { verifyCallbackHash } from '@/lib/paytr'
import { BILLING_PLANS, resolveBillingPlanKey } from '@/lib/subscription-plans'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// PayTR'ın "bildirim" (Adım 2 / webhook) uç noktası — dev.paytr.com/iframe-api/iframe-api-2-adim.
//
// Iyzico'nun aksine bu istek tarayıcının yönlendirmesi DEĞİL: PayTR
// sunucudan sunucuya, asenkron olarak POST atıyor. Tarayıcı yönlendirmesi
// (merchant_ok_url/merchant_fail_url, bkz. app/checkout/page.tsx) sadece
// kullanıcıya bir ekran göstermek için — GÜVENİLİR sonuç DEĞİL. Planı
// aktive eden TEK yer burasıdır.
//
// PayTR'ın dokümantasyonuna göre:
//  - Yanıt gövdesi TAM OLARAK "OK" (düz metin) olmalı, yoksa PayTR bildirimi
//    tekrar tekrar dener ve sipariş panelinde sonsuza kadar "Devam Ediyor"
//    görünür.
//  - Aynı ödeme için birden fazla bildirim gelebilir (ağ tekrarları) — bu
//    yüzden merchant_oid'ye göre idempotent olmak ZORUNLU (aşağıda 'active'
//    kontrolü bunu sağlıyor).
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const merchantOid = String(formData.get('merchant_oid') || '')
    const status = String(formData.get('status') || '')
    const totalAmount = String(formData.get('total_amount') || '')
    const hash = String(formData.get('hash') || '')

    if (!merchantOid || !hash) {
      console.error('[paytr callback] eksik alan(lar):', { merchantOid, hasHash: !!hash })
      return new NextResponse('PAYTR notification failed: missing fields', { status: 400 })
    }

    if (!verifyCallbackHash({ merchantOid, status, totalAmount, hash })) {
      console.error('[paytr callback] hash doğrulanamadı, merchant_oid:', merchantOid)
      return new NextResponse('PAYTR notification failed: bad hash', { status: 400 })
    }

    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('id, user_id, plan, status')
      .eq('stripe_subscription_id', merchantOid)
      .eq('provider', 'paytr')
      .maybeSingle()

    if (!sub) {
      // Hash doğru ama bizde böyle bir kayıt yok — normalde olmamalı (test_mode
      // dışı bir OID, silinmiş kayıt vs.). PayTR'a yine de OK dönüp sonsuz
      // retry'ı önlüyoruz; bu durum sunucu loglarında görünür kalır.
      console.error('[paytr callback] eşleşen subscription bulunamadı, merchant_oid:', merchantOid)
      return new NextResponse('OK')
    }

    // Idempotency: aynı ödeme için tekrar gelen bildirimlerde (veya kullanıcı
    // 'active' olduktan sonra tekrar tetiklenen bir istekte) hiçbir şeyi
    // ikinci kez uygulama.
    if (sub.status === 'active') {
      return new NextResponse('OK')
    }

    if (status !== 'success') {
      await supabaseAdmin.from('subscriptions').update({ status: 'failed' }).eq('id', sub.id)
      return new NextResponse('OK')
    }

    const planType = resolveBillingPlanKey(sub.plan)
    if (!planType) {
      console.error('[paytr callback] geçersiz plan değeri:', sub.plan, 'merchant_oid:', merchantOid)
      return new NextResponse('OK')
    }
    const meta = BILLING_PLANS[planType]

    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + meta.months)

    const { data: updatedProfile, error: profileUpdateError } = await supabaseAdmin.from('profiles').update({
      plan: meta.profilePlan,
      plan_expires_at: expiresAt.toISOString(),
      monthly_test_count: 0,
      daily_test_count: 0,
    }).eq('id', sub.user_id).select('id').maybeSingle()

    if (profileUpdateError || !updatedProfile) {
      console.error('[paytr callback] profil üyeliği güncellenemedi:', {
        userId: sub.user_id,
        plan: meta.profilePlan,
        error: profileUpdateError?.message || 'Profil bulunamadı.',
      })
      // Üyelik profilde görünür hale gelmediyse ödemeyi başarılı sayma.
      // PayTR yeniden bildirim gönderir; tekrar deneyerek tutarlı hale gelir.
      return new NextResponse('profile update failed', { status: 500 })
    }

    // Görünen isimler: silver=Gümüş, premium=Altın, unlimited=Platin
    // (bkz. app/api/iyzico/callback/route.ts'teki aynı yorum).
    const displayName = meta.tierName
    const emoji = meta.profilePlan === 'unlimited' ? '👑' : meta.profilePlan === 'silver' ? '🥈' : '⭐'
    const { error: notificationError } = await supabaseAdmin.from('notifications').insert({
      user_id: sub.user_id,
      type: 'system',
      title: `${emoji} ${displayName} aktif!`,
      body: `${displayName} planın başarıyla aktive edildi. İyi çalışmalar!`,
      read: false,
      data: { href: '/pricing' },
    })
    if (notificationError) {
      // Bildirim hatası üyeliğin aktive edilmesini engellememeli.
      console.error('[paytr callback] aktivasyon bildirimi oluşturulamadı:', notificationError.message)
    }

    const { data: activatedSubscription, error: activationError } = await supabaseAdmin.from('subscriptions').update({
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: expiresAt.toISOString(),
    }).eq('id', sub.id).eq('status', 'pending').select('id').maybeSingle()

    if (activationError) {
      console.error('[paytr callback] abonelik kaydı active yapılamadı:', {
        subscriptionId: sub.id,
        userId: sub.user_id,
        plan: meta.profilePlan,
        error: activationError.message,
      })
      return new NextResponse('subscription activation failed', { status: 500 })
    }

    if (!activatedSubscription) {
      // Eşzamanlı tekrar bildiriminde diğer istek aboneliği aktive etmiş
      // olabilir. Durumu okuyup yalnızca gerçekten active ise OK dön.
      const { data: currentSubscription, error: statusError } = await supabaseAdmin
        .from('subscriptions')
        .select('status')
        .eq('id', sub.id)
        .maybeSingle()
      if (statusError || currentSubscription?.status !== 'active') {
        console.error('[paytr callback] abonelik active durumu doğrulanamadı:', {
          subscriptionId: sub.id,
          error: statusError?.message || 'Abonelik active değil.',
        })
        return new NextResponse('subscription activation unverified', { status: 500 })
      }
    }

    return new NextResponse('OK')
  } catch (e) {
    console.error('[paytr callback] beklenmeyen hata:', e)
    // Bilerek "OK" DEĞİL — 500 dönersek PayTR bildirimi tekrar dener, bu da
    // geçici bir hata (ör. DB kesintisi) durumunda kendi kendine iyileşmeyi sağlar.
    return new NextResponse('error', { status: 500 })
  }
}

// PayTR normalde POST ile bildirim yapar; bir tarayıcı ya da sağlık kontrolü
// bu adrese GET atarsa 200 dönmek yeterli.
export async function GET() {
  return new NextResponse('OK')
}
