// app/api/cron/due-assignments/route.ts
// Vercel Cron: her gün 08:00'de çalışır
// vercel.json: { "crons": [{ "path": "/api/cron/due-assignments", "schedule": "0 5 * * *" }] }

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { isCronAuthorized } from '@/lib/cron-auth'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Cron secret kontrolü
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Yarın sonu dolacak ödevleri bul (due_date = bugün + 1)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const { data: dueSoonAssignments } = await supabaseAdmin
    .from('assignments')
    .select('id, title, topic, classroom_id, due_date, classrooms(name)')
    .gte('due_date', tomorrowStr + 'T00:00:00')
    .lte('due_date', tomorrowStr + 'T23:59:59')

  // Bugün süresi dolan ödevler
  const { data: expiredAssignments } = await supabaseAdmin
    .from('assignments')
    .select('id, title, topic, classroom_id, due_date, classrooms(name)')
    .gte('due_date', todayStr + 'T00:00:00')
    .lte('due_date', todayStr + 'T23:59:59')

  let notifsSent = 0

  // Yarın dolacak ödevler → henüz tamamlamamış öğrencilere bildir
  for (const asgn of (dueSoonAssignments ?? [])) {
    const { data: students } = await supabaseAdmin
      .from('classroom_students')
      .select('student_id')
      .eq('classroom_id', asgn.classroom_id)

    const { data: completions } = await supabaseAdmin
      .from('assignment_completions')
      .select('student_id')
      .eq('assignment_id', asgn.id)

    const completedIds = new Set((completions ?? []).map((c) => c.student_id))
    const pendingStudents = (students ?? []).filter((s) => !completedIds.has(s.student_id))

    if (!pendingStudents.length) continue

    const notifRows = pendingStudents.map((s) => ({
      user_id: s.student_id,
      type: 'assignment',
      title: '⏰ Ödev yarın bitiyor!',
      body: `"${asgn.title}" ödevinin son tarihi yarın. Hemen çöz!`,
      read: false,
      data: { assignment_id: asgn.id, href: '/assignments' },
    }))

    await supabaseAdmin.from('notifications').insert(notifRows)
    notifsSent += notifRows.length
  }

  // Bugün süresi dolan ödevler → tamamlamamışlara son uyarı
  for (const asgn of (expiredAssignments ?? [])) {
    const { data: students } = await supabaseAdmin
      .from('classroom_students')
      .select('student_id')
      .eq('classroom_id', asgn.classroom_id)

    const { data: completions } = await supabaseAdmin
      .from('assignment_completions')
      .select('student_id')
      .eq('assignment_id', asgn.id)

    const completedIds = new Set((completions ?? []).map((c) => c.student_id))
    const pendingStudents = (students ?? []).filter((s) => !completedIds.has(s.student_id))

    if (!pendingStudents.length) continue

    const notifRows = pendingStudents.map((s) => ({
      user_id: s.student_id,
      type: 'assignment',
      title: '🚨 Ödev bugün bitiyor!',
      body: `"${asgn.title}" ödevinin son günü bugün. Son şansın!`,
      read: false,
      data: { assignment_id: asgn.id, href: '/assignments' },
    }))

    await supabaseAdmin.from('notifications').insert(notifRows)
    notifsSent += notifRows.length
  }

  return NextResponse.json({
    ok: true,
    dueSoon: dueSoonAssignments?.length ?? 0,
    expired: expiredAssignments?.length ?? 0,
    notifsSent,
    date: todayStr,
  })
}
