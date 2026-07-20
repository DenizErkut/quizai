import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateIyzicoAuthHeader } from '@/lib/iyzico'

const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pratium.com'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const IYZICO_DETAIL_URI_PATH = '/payment/iyzipos/checkoutform/auth/ecom/detail'

const PLAN_META: Record<string, { months: number; plan: string }> = {
  monthly:   { months: 1,  plan: 'premium'   },
  yearly:    { months: 12, plan: 'premium'   },
  unlimited: { months: 12, plan: 'unlimited' },
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const token = formData.get('token') as string
    const status = formData.get('status') as string

    if (!token) {
      return NextResponse.redirect(`${APP_URL}/pricing?payment=error`)
    }

    // iyzico'dan sonucu doğrula
    const verifyBody = JSON.stringify({ locale: 'tr', token })
    const verifyRes = await fetch(
      `${IYZICO_BASE_URL}/payment/iyzipos/checkoutform/auth/ecom/detail`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: generateIyzicoAuthHeader(IYZICO_DETAIL_URI_PATH, verifyBody),
        },
        body: verifyBody,
      }
    )

    const result = await verifyRes.json()

    if (result.paymentStatus !== 'SUCCESS') {
      console.error('Payment failed:', result)
      return NextResponse.redirect(`${APP_URL}/pricing?payment=failed`)
    }

    // conversationId'den userId ve plan çıkar
    const conversationId = result.conversationId as string
    const parts = conversationId.split('_')
    const userId = parts[0]
    const planType = parts[1] as 'monthly' | 'yearly' | 'unlimited'
    const meta = PLAN_META[planType] || { months: 1, plan: 'premium' }

    // Plan aktive et (premium veya unlimited)
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + meta.months)

    await supabaseAdmin.from('profiles').update({
      plan: meta.plan,
      plan_expires_at: expiresAt.toISOString(),
      monthly_test_count: 0,
      daily_test_count: 0,
    }).eq('id', userId)

    // Aktivasyon bildirimi gönder
    await supabaseAdmin.from('notifications').insert({
      user_id: userId,
      type: 'system',
      title: meta.plan === 'unlimited' ? '👑 Unlimited aktif!' : '⭐ Premium aktif!',
      body: `${meta.plan === 'unlimited' ? 'Unlimited' : 'Premium'} planın başarıyla aktive edildi. İyi çalışmalar!`,
      read: false,
      data: { href: '/pricing' },
    })

    // Subscription güncelle
    await supabaseAdmin.from('subscriptions').update({
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: expiresAt.toISOString(),
      stripe_customer_id: result.paymentId,
    }).eq('stripe_subscription_id', conversationId)

    return NextResponse.redirect(`${APP_URL}/pricing?payment=success`)
  } catch (e) {
    console.error('Callback error:', e)
    return NextResponse.redirect(`${APP_URL}/pricing?payment=error`)
  }
}

// GET — iyzico bazen GET ile de callback yapar
export async function GET(req: NextRequest) {
  return NextResponse.redirect(`${APP_URL}/pricing`)
}
