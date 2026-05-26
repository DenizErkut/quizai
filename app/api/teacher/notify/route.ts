// app/api/teacher/notify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  // Auth kontrolü
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Öğretmen kontrolü
  const { data: teacher } = await supabaseAdmin
    .from('teachers')
    .select('id, approved')
    .eq('user_id', user.id)
    .single()

  if (!teacher?.approved) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })
  }

  const { classroom_id, message, title } = await req.json()

  if (!classroom_id || !message?.trim()) {
    return NextResponse.json({ error: 'Eksik parametre.' }, { status: 400 })
  }

  // Sınıftaki öğrencileri çek
  const { data: students } = await supabaseAdmin
    .from('classroom_students')
    .select('student_id')
    .eq('classroom_id', classroom_id)

  const studentIds = (students ?? []).map((s: any) => s.student_id)

  if (studentIds.length === 0) {
    // Yine de geçmişe kaydet
    await supabaseAdmin.from('teacher_notifications').insert({
      teacher_id: teacher.id,
      classroom_id,
      message: message.trim(),
      recipient_count: 0,
      delivered_count: 0,
    })
    return NextResponse.json({ success: true, recipientCount: 0, deliveredCount: 0 })
  }

  // ✅ notifications tablosuna her öğrenci için INSERT (in-app bildirim)
  const notificationRows = studentIds.map((student_id: string) => ({
    user_id: student_id,
    type: 'teacher_message',
    title: title ?? '📢 Öğretmeninizden mesaj',
    body: message.trim(),
    read: false,
    data: { classroom_id },
  }))

  await supabaseAdmin.from('notifications').insert(notificationRows)

  // ✅ Web push — subscription varsa gönder (opsiyonel, başarısız olsa da devam et)
  let pushDelivered = 0

  try {
    webpush.setVapidDetails(
      'mailto:info@pratium.com',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )

    const { data: subscriptions } = await supabaseAdmin
      .from('push_subscriptions')
      .select('user_id, subscription')
      .in('user_id', studentIds)

    for (const sub of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          JSON.parse(sub.subscription),
          JSON.stringify({
            title: title ?? '📢 Öğretmeninizden mesaj',
            body: message.trim(),
            url: '/notifications',
          })
        )
        pushDelivered++
      } catch {
        // Geçersiz subscription — sil
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', sub.user_id)
      }
    }
  } catch {
    // VAPID ayarı yoksa push atla, in-app yeterli
  }

  // Geçmişe kaydet
  const { data: notifRecord } = await supabaseAdmin
    .from('teacher_notifications')
    .insert({
      teacher_id: teacher.id,
      classroom_id,
      message: message.trim(),
      recipient_count: studentIds.length,
      delivered_count: pushDelivered, // push delivered count
    })
    .select('*, classrooms(name)')
    .single()

  return NextResponse.json({
    success: true,
    recipientCount: studentIds.length,
    pushDelivered,
    notifRecord,
  })
}
