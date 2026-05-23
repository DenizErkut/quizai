import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

webpush.setVapidDetails(
  'mailto:info@pratium.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Push subscription kaydet
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { subscription, action } = await req.json()

  if (action === 'subscribe') {
    await supabaseAdmin.from('push_subscriptions').upsert({
      user_id: user.id,
      subscription: JSON.stringify(subscription),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    return NextResponse.json({ ok: true })
  }

  if (action === 'unsubscribe') {
    await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', user.id)
    return NextResponse.json({ ok: true })
  }

  // Test bildirimi gönder
  if (action === 'test') {
    const { data: sub } = await supabaseAdmin
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', user.id)
      .single()

    if (!sub) return NextResponse.json({ error: 'Subscription bulunamadı.' }, { status: 404 })

    await webpush.sendNotification(
      JSON.parse(sub.subscription),
      JSON.stringify({
        title: 'Pratium 🎯',
        body: 'Bildirimler aktif! Günlük test hatırlatmaları artık sende.',
        url: '/quiz',
      })
    )
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Geçersiz action.' }, { status: 400 })
}

// Günlük hatırlatma gönder (cron job için)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('user_id, subscription')

  if (!subs || subs.length === 0) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const sub of subs) {
    try {
      // Bugün test çözmüş mü kontrol et
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { data: todayTest } = await supabaseAdmin
        .from('quiz_sessions')
        .select('id')
        .eq('user_id', sub.user_id)
        .eq('completed', true)
        .gte('created_at', today.toISOString())
        .limit(1)
        .single()

      if (!todayTest) {
        // Bugün test çözmemiş — bildirim gönder
        await webpush.sendNotification(
          JSON.parse(sub.subscription),
          JSON.stringify({
            title: 'Pratium — Günlük Test 🔥',
            body: 'Bugünkü testini henüz çözmedin! Streakini korumak için hadi başla.',
            url: '/daily',
          })
        )
        sent++
      }
    } catch (e) {
      // Geçersiz subscription — sil
      await supabaseAdmin.from('push_subscriptions').delete().eq('user_id', sub.user_id)
    }
  }

  return NextResponse.json({ sent })
}
