import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const IYZICO_API_KEY = process.env.IYZICO_API_KEY!
const IYZICO_SECRET_KEY = process.env.IYZICO_SECRET_KEY!
const IYZICO_BASE_URL = process.env.IYZICO_BASE_URL!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://quizai-coral.vercel.app'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateAuthHeader(body: string): string {
  const randomKey = Math.random().toString(36).substring(2)
  const toSign = IYZICO_API_KEY + randomKey + IYZICO_SECRET_KEY + body
  const hash = crypto.createHmac('sha256', IYZICO_SECRET_KEY)
    .update(toSign).digest('base64')
  const authString = `apiKey:${IYZICO_API_KEY}&randomKey:${randomKey}&signature:${hash}`
  return 'IYZWSv2 ' + Buffer.from(authString).toString('base64')
}

const PLAN_MONTHS: Record<string, number> = {
  monthly: 1,
  yearly: 12,
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
          Authorization: generateAuthHeader(verifyBody),
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
    const planType = parts[1] as 'monthly' | 'yearly'
    const months = PLAN_MONTHS[planType] || 1

    // Premium aktive et
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + months)

    await supabaseAdmin.from('profiles').update({
      plan: 'premium',
      plan_expires_at: expiresAt.toISOString(),
      monthly_test_count: 0,
    }).eq('id', userId)

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
