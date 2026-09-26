import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentityBySupabaseId } from '@/lib/identity/client'
import { BILLING_PLANS, resolveBillingPlanKey } from '@/lib/subscription-plans'
import { resolveDiscountCode } from '@/lib/referral-code'
import {
  PAYTR_MERCHANT_ID,
  PAYTR_GET_TOKEN_URL,
  generateGetTokenHash,
  buildUserBasket,
  generateMerchantOid,
} from '@/lib/paytr'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pratium.com'
// PAYTR_TEST_MODE=1 sadece test/staging'de kullanılmalı — production'da hiç set edilmemeli.
const PAYTR_TEST_MODE: 0 | 1 = process.env.PAYTR_TEST_MODE === '1' ? 1 : 0

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// 22 Eylül 2026 — Deniz'in kararıyla: Iyzico'dan PayTR'a TAM GEÇİŞ.
// Bu route app/api/iyzico/checkout/route.ts ile aynı iş mantığını
// (auth, plan çözümü, satıcı indirimi) taşıyor ama PayTR'ın get-token
// (Adım 1) isteğine uygun alanlarla. Kart bilgisi PayTR'ın iframe'inde
// toplanıyor — bu route sadece bir token alıp frontend'e döndürüyor.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })
  if (!user.email) return NextResponse.json({ error: 'Hesabınızda e-posta bulunamadı.' }, { status: 400 })

  const body = await req.json()
  const planType = resolveBillingPlanKey(body.plan)
  if (!planType) return NextResponse.json({ error: 'Geçersiz plan.' }, { status: 400 })
  if (!planType.endsWith('_yearly')) {
    return NextResponse.json({ error: 'Satın alma işlemleri şu anda yalnızca yıllık planlar için açık.' }, { status: 400 })
  }
  const plan = BILLING_PLANS[planType]

  const identity = await getIdentityBySupabaseId(user.id)
  const fullName = identity?.full_name || 'Kullanici'

  let sellerId: string | null = null
  let discountRate = 0

  // Checkout ekranındaki "Satıcı/Kurum Kodu" alanına elle girilen kod —
  // varsa, kayıt anında profile bağlanmış olan otomatik satıcı indirimini
  // EZER (kullanıcı bilinçli olarak bu kodu girdiği için). Kod client'ta
  // önizleme amaçlı /api/checkout/apply-code ile önceden doğrulanmış olsa
  // bile, gerçek tahsilat burada YENİDEN doğrulanır — client'tan gelen bir
  // indirim oranına asla güvenilmez.
  const manualCode = String(body.code || '').trim()
  if (manualCode) {
    const resolved = await resolveDiscountCode(supabaseAdmin, manualCode)
    if (!resolved.found) {
      return NextResponse.json({ error: 'Satıcı/kurum kodu artık geçerli değil. Lütfen kodu kaldırıp tekrar deneyin.' }, { status: 400 })
    }
    sellerId = resolved.sellerId
    discountRate = resolved.discountRate
  } else {
    // Kod girilmediyse, kayıt olurken bağlanmış olan otomatik satıcı
    // indirimine düş — Iyzico route'uyla birebir aynı mantık (bkz.
    // app/api/iyzico/checkout/route.ts).
    const { data: buyerProfile } = await supabaseAdmin
      .from('profiles').select('seller_id').eq('id', user.id).maybeSingle()
    if (buyerProfile?.seller_id) {
      const { data: seller } = await supabaseAdmin
        .from('sellers').select('id, discount_rate, active').eq('id', buyerProfile.seller_id).maybeSingle()
      if (seller?.active) {
        sellerId = seller.id
        discountRate = Number(seller.discount_rate) || 0
      }
    }
  }

  const basePrice = plan.price
  const finalPrice = discountRate > 0
    ? Math.max(0, basePrice * (1 - discountRate / 100))
    : basePrice
  const finalPriceStr = finalPrice.toFixed(2)

  const merchantOid = generateMerchantOid()
  // x-forwarded-for birden fazla IP içerebilir ("client, proxy1, proxy2") — ilkini al.
  const userIp = (req.headers.get('x-forwarded-for') || '127.0.0.1').split(',')[0].trim().slice(0, 39)
  const email = user.email.slice(0, 100)
  const paymentAmountKurus = Math.round(finalPrice * 100)
  const userBasketBase64 = buildUserBasket([
    {
      name: discountRate > 0 ? `${plan.displayName} (%${discountRate} indirimli)` : plan.displayName,
      price: finalPrice,
      quantity: 1,
    },
  ])

  const noInstallment: 0 | 1 = 0
  const maxInstallment = 12 // Iyzico'daki enabledInstallments:[1,2,3,6,9,12] ile kabaca eşleşsin diye üst sınır
  const currency = 'TL'

  const paytrToken = generateGetTokenHash({
    userIp,
    merchantOid,
    email,
    paymentAmountKurus,
    userBasketBase64,
    noInstallment,
    maxInstallment,
    currency,
    testMode: PAYTR_TEST_MODE,
  })

  const formBody = new URLSearchParams({
    merchant_id: PAYTR_MERCHANT_ID,
    user_ip: userIp,
    merchant_oid: merchantOid,
    email,
    payment_amount: String(paymentAmountKurus),
    paytr_token: paytrToken,
    user_basket: userBasketBase64,
    debug_on: '0',
    no_installment: String(noInstallment),
    max_installment: String(maxInstallment),
    user_name: fullName,
    user_address: 'Türkiye',
    user_phone: '5000000000',
    // Bu URL'ler sadece TARAYICI yönlendirmesi için — PayTR'ın "gerçek" ve
    // güvenilir sonucu aşağıdaki /api/paytr/callback'e ayrı bir sunucu-sunucu
    // bildirimiyle gelir (bkz. o dosyadaki yorum). Bu yüzden merchant_ok_url
    // planı hemen aktifmiş gibi göstermiyor, "processing" ekranına düşürüyor
    // ve frontend /api/paytr/status'u polluyor.
    merchant_ok_url: `${APP_URL}/checkout?payment=processing&oid=${merchantOid}&plan=${planType}`,
    merchant_fail_url: `${APP_URL}/checkout?payment=failed`,
    timeout_limit: '30',
    currency,
    test_mode: String(PAYTR_TEST_MODE),
    lang: 'tr',
  })

  try {
    const ptRes = await fetch(PAYTR_GET_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody.toString(),
    })
    const data = await ptRes.json()

    if (data.status !== 'success') {
      console.error('[paytr checkout] get-token başarısız:', data)
      return NextResponse.json({ error: data.reason || 'Ödeme başlatılamadı.' }, { status: 400 })
    }

    // subscriptions satırını 'pending' olarak aç — bildirim (callback) bu
    // satırı merchant_oid'den bulup aktive edecek. seller/discount izi satın
    // alma anındaki anlık görüntü olarak saklanıyor (Iyzico route'uyla aynı gerekçe).
    const { error: subscriptionInsertError } = await supabaseAdmin.from('subscriptions').insert({
      user_id: user.id,
      plan: planType,
      status: 'pending',
      provider: 'paytr',
      stripe_subscription_id: merchantOid, // PayTR merchant_oid (sütun adı Stripe'tan kalma, yeniden kullanılıyor)
      seller_id: sellerId,
      discount_rate: discountRate,
      price_paid: finalPrice,
    })

    if (subscriptionInsertError) {
      console.error('[paytr checkout] pending subscription kaydı oluşturulamadı:', {
        merchantOid,
        userId: user.id,
        error: subscriptionInsertError.message,
      })
      return NextResponse.json({ error: 'Ödeme hazırlığı tamamlanamadı. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    return NextResponse.json({ token: data.token, merchantOid })
  } catch (e) {
    console.error('[paytr checkout] fetch hatası:', e)
    return NextResponse.json({ error: 'Ödeme servisi hatası.' }, { status: 500 })
  }
}
