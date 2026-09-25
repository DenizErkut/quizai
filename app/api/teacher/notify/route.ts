// app/api/teacher/notify/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import webpush from 'web-push'
import { randomUUID } from 'node:crypto'

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

  const body = await req.json()
  const { classroom_id, message, title } = body

  if (!classroom_id) {
    return NextResponse.json({ error: 'Sınıf seçilmedi. Lütfen bir sınıf seçin.', debug: { classroom_id, teacher_approved: teacher?.approved } }, { status: 400 })
  }
  if (!message?.trim() || message.trim().length > 2000) {
    return NextResponse.json({ error: 'Mesaj boş olamaz ve 2000 karakteri aşamaz.' }, { status: 400 })
  }

  const { data: classroom } = await supabaseAdmin
    .from('classrooms')
    .select('id')
    .eq('id', classroom_id)
    .eq('teacher_id', teacher.id)
    .maybeSingle()
  if (!classroom) {
    return NextResponse.json({ error: 'Bu sınıfa erişim yetkiniz yok.' }, { status: 403 })
  }

  // Sınıftaki öğrencileri çek
  const { data: students } = await supabaseAdmin
    .from('classroom_students')
    .select('student_id')
    .eq('classroom_id', classroom_id)

  const studentIds = ((students ?? []) as Array<{ student_id: string }>).map(s => s.student_id)
  const requestId = randomUUID()
  const writeAudit = async (event: {
    event_type: 'attempted' | 'completed' | 'failed'
    recipient_count?: number
    push_delivered_count?: number
    reason_code: 'dispatch_started' | 'no_recipients' | 'completed' | 'partial_push_failure' | 'in_app_delivery_failed' | 'notification_history_write_failed'
    metadata?: Record<string, unknown>
  }) => {
    const { error } = await supabaseAdmin.from('teacher_notification_audit').insert({
      request_id: requestId,
      actor_id: user.id,
      teacher_id: teacher.id,
      classroom_id,
      ...event,
      metadata: event.metadata ?? {},
    })
    if (error) throw new Error(`teacher_notification_audit_write_failed:${error.code || 'unknown'}`)
  }

  // Fail closed before sending: if the attempt cannot be durably audited,
  // do not dispatch notifications. The audit contains no message or student IDs.
  try {
    await writeAudit({ event_type: 'attempted', recipient_count: studentIds.length, reason_code: 'dispatch_started' })
  } catch (error) {
    console.error('[notify] audit attempt could not be persisted', error)
    return NextResponse.json({ error: 'Bildirim güvenli biçimde başlatılamadı.' }, { status: 500 })
  }

  if (studentIds.length === 0) {
    // Yine de geçmişe kaydet
    const { error: historyError } = await supabaseAdmin.from('teacher_notifications').insert({
      teacher_id: teacher.id,
      classroom_id,
      message: message.trim(),
      recipient_count: 0,
      delivered_count: 0,
    })
    await writeAudit({
      event_type: historyError ? 'failed' : 'completed',
      recipient_count: 0,
      push_delivered_count: 0,
      reason_code: historyError ? 'notification_history_write_failed' : 'no_recipients',
    })
    if (historyError) return NextResponse.json({ error: 'Bildirim kaydı oluşturulamadı.' }, { status: 500 })
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

  const { error: deliveryError } = await supabaseAdmin.from('notifications').insert(notificationRows)
  if (deliveryError) {
    await writeAudit({ event_type: 'failed', recipient_count: studentIds.length, reason_code: 'in_app_delivery_failed' })
    return NextResponse.json({ error: 'Bildirimler gönderilemedi.' }, { status: 500 })
  }

  // ✅ Web push — subscription varsa gönder (opsiyonel, başarısız olsa da devam et)
  let pushDelivered = 0
  let pushFailed = 0
  let pushUnavailable = false

  try {
    webpush.setVapidDetails(
      'mailto:info@pratium.com.tr',
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
        pushFailed++
        // Geçersiz subscription — sil
        await supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .eq('user_id', sub.user_id)
      }
    }
  } catch {
    pushUnavailable = true
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

  // Completion is a second append-only event. The durable attempted event is
  // retained if this write fails, avoiding a duplicate-send retry response.
  try {
    await writeAudit({
      event_type: 'completed',
      recipient_count: studentIds.length,
      push_delivered_count: pushDelivered,
      reason_code: pushFailed > 0 || pushUnavailable
        ? 'partial_push_failure'
        : notifRecord ? 'completed' : 'notification_history_write_failed',
      metadata: {
        push_failure_count: pushFailed,
        push_unavailable: pushUnavailable,
        notification_history_saved: Boolean(notifRecord),
      },
    })
  } catch (error) {
    console.error('[notify] completion audit could not be persisted', error)
  }

  return NextResponse.json({
    success: true,
    recipientCount: studentIds.length,
    pushDelivered,
    notifRecord,
  })
}
