import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentityBySupabaseId } from '@/lib/identity/client'
import { generateIyzicoAuthHeader } from '@/lib/iyzico'

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pratium.com'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const IYZICO_CHECKOUT_URI_PATH = '/payment/iyzipos/checkoutform/initialize/auth/ecom'

const PLANS = {
  monthly:   { price: '499.0',   name: 'Pratium Premium - Aylık',    months: 1,  plan: 'premium'   },
  yearly:    { price: '4490.0',  name: 'Pratium Premium - Yıllık',   months: 12, plan: 'premium'   },
  unlimited: { price: '19990.0', name: 'Pratium Unlimited - Yıllık', months: 12, plan: 'unlimited' },
}

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

  const body = await req.json()
  const planType = body.plan as 'monthly' | 'yearly' | 'unlimited'
  const plan = PLANS[planType]
  if (!plan) return NextResponse.json({ error: 'Geçersiz plan.' }, { status: 400 })

  // Fatura için ad-soyad TR-PG kimliğinden
  const identity = await getIdentityBySupabaseId(user.id)
  const fullName = identity?.full_name || 'Kullanici'

  // Kullanıcı bir satıcının kodu/linki üzerinden kayıt olduysa (profiles.seller_id),
  // o satıcının o anki indirim oranını uygula. Oran, satın alma anında
  // subscriptions'a da kopyalanır — satıcının oranı ileride değişse bile bu
  // kaydın tarihsel doğruluğu bozulmaz.
  const { data: buyerProfile } = await supabaseAdmin
    .from('profiles').select('seller_id').eq('id', user.id).maybeSingle()

  let sellerId: string | null = null
  let discountRate = 0
  if (buyerProfile?.seller_id) {
    const { data: seller } = await supabaseAdmin
      .from('sellers').select('id, discount_rate, active').eq('id', buyerProfile.seller_id).maybeSingle()
    if (seller?.active) {
      sellerId = seller.id
      discountRate = Number(seller.discount_rate) || 0
    }
  }

  const basePrice = parseFloat(plan.price)
  const finalPrice = discountRate > 0
    ? Math.max(0, basePrice * (1 - discountRate / 100)).toFixed(2)
    : plan.price

  const conversationId = `${user.id}_${planType}_${Date.now()}`
  const nameParts = fullName.split(' ')
  const firstName = nameParts[0] || 'Kullanici'
  const lastName = nameParts.slice(1).join(' ') || 'Kullanici'

  const requestBody = {
    locale: 'tr',
    conversationId,
    price: finalPrice,
    paidPrice: finalPrice,
    currency: 'TRY',
    basketId: conversationId,
    paymentGroup: 'SUBSCRIPTION',
    callbackUrl: `${APP_URL}/api/iyzico/callback`,
    enabledInstallments: [1, 2, 3, 6, 9, 12],
    buyer: {
      id: user.id,
      name: firstName,
      surname: lastName,
      gsmNumber: '+905000000000',
      email: user.email,
      identityNumber: '74300864791',
      registrationAddress: 'Türkiye',
      ip: req.headers.get('x-forwarded-for') || '127.0.0.1',
      city: 'Istanbul',
      country: 'Turkey',
    },
    shippingAddress: {
      contactName: fullName,
      city: 'Istanbul',
      country: 'Turkey',
      address: 'Türkiye',
    },
    billingAddress: {
      contactName: fullName,
      city: 'Istanbul',
      country: 'Turkey',
      address: 'Türkiye',
    },
    basketItems: [
      {
        id: `pratium_${planType}`,
        name: discountRate > 0 ? `${plan.name} (%${discountRate} indirimli)` : plan.name,
        category1: 'Dijital Ürün',
        itemType: 'VIRTUAL',
        price: finalPrice,
      },
    ],
  }

  const bodyStr = JSON.stringify(requestBody)

  try {
    const response = await fetch(`${IYZICO_BASE_URL}/payment/iyzipos/checkoutform/initialize/auth/ecom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: generateIyzicoAuthHeader(IYZICO_CHECKOUT_URI_PATH, bodyStr),
      },
      body: bodyStr,
    })

    const data = await response.json()

    if (data.status !== 'success') {
      console.error('iyzico error:', data)
      return NextResponse.json({ error: data.errorMessage || 'Ödeme başlatılamadı.' }, { status: 400 })
    }

    // conversationId'yi Supabase'e kaydet (webhook'ta kullanılacak) —
    // satıcı ve indirim izi de burada saklanır (satın alma anındaki
    // anlık görüntü olarak, satıcının oranı sonradan değişse bile bozulmaz).
    await supabaseAdmin.from('subscriptions').insert({
      user_id: user.id,
      plan: planType,
      status: 'pending',
      stripe_subscription_id: conversationId, // iyzico conversationId
      seller_id: sellerId,
      discount_rate: discountRate,
      price_paid: parseFloat(finalPrice),
    })

    return NextResponse.json({
      checkoutFormContent: data.checkoutFormContent,
      token: data.token,
      conversationId,
    })
  } catch (e) {
    console.error('iyzico fetch error:', e)
    return NextResponse.json({ error: 'Ödeme servisi hatası.' }, { status: 500 })
  }
}
