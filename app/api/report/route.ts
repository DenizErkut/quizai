// app/api/report/route.ts
// Tüm rol tipleri için rapor verisi — service role ile
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAuthUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Tek kullanıcı için quiz istatistikleri
async function getUserStats(userId: string) {
  const { data: sessions } = await adminClient
    .from('quiz_sessions')
    .select('id, topic, score, pct, question_count, created_at, question_type, answers, completed')
    .eq('user_id', userId)
    .eq('completed', true)
    .order('created_at', { ascending: false })

  const s = sessions ?? []
  const totalTests = s.length
  const totalQuestions = s.reduce((a: number, x: any) => a + (x.question_count || 0), 0)
  const totalCorrect = s.reduce((a: number, x: any) => a + (x.score || 0), 0)
  const avgPct = totalTests > 0 ? Math.round(s.reduce((a: number, x: any) => a + (x.pct || 0), 0) / totalTests) : 0
  const perfect = s.filter((x: any) => x.pct === 100).length
  const failing = s.filter((x: any) => x.pct < 50).length
  const passing = s.filter((x: any) => x.pct >= 50 && x.pct < 80).length
  const good = s.filter((x: any) => x.pct >= 80 && x.pct < 100).length

  // Son 7 gün
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
  const weeklyTests = s.filter((x: any) => new Date(x.created_at) > weekAgo).length

  // Konu dağılımı — en çok çözülen 5 konu
  const topicCounts: Record<string, { count: number; totalPct: number }> = {}
  s.forEach((x: any) => {
    if (!x.topic) return
    if (!topicCounts[x.topic]) topicCounts[x.topic] = { count: 0, totalPct: 0 }
    topicCounts[x.topic].count++
    topicCounts[x.topic].totalPct += x.pct || 0
  })
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)
    .map(([topic, d]) => ({ topic, count: d.count, avgPct: Math.round(d.totalPct / d.count) }))

  // Soru tipi dağılımı
  const typeCounts: Record<string, number> = {}
  s.forEach((x: any) => { if (x.question_type) typeCounts[x.question_type] = (typeCounts[x.question_type] || 0) + 1 })

  // Son 10 test için trend (pct değerleri)
  const trend = s.slice(0, 10).reverse().map((x: any) => ({ pct: x.pct, topic: x.topic, date: x.created_at }))

  return {
    totalTests, totalQuestions, totalCorrect, avgPct,
    perfect, failing, passing, good,
    weeklyTests, topTopics, typeCounts, trend,
    recentSessions: s.slice(0, 20),
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'student' // student | parent | teacher | admin
  const targetId = searchParams.get('userId') // parent/teacher için çocuk/öğrenci ID

  // Profil ve rol kontrolü
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, name, grade, plan, is_admin, role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // ── ÖĞRENCİ RAPORU ──
  if (type === 'student') {
    const stats = await getUserStats(user.id)
    const { data: streak } = await adminClient
      .from('streaks')
      .select('current_streak, longest_streak, total_points')
      .eq('user_id', user.id)
      .maybeSingle()
    const { data: weakTopics } = await adminClient
      .from('weak_topics')
      .select('topic, subject, wrong_count, total_count')
      .eq('user_id', user.id)
      .order('wrong_count', { ascending: false })
      .limit(5)

    return NextResponse.json({
      type: 'student',
      stats,
      streak: streak ?? { current_streak: 0, longest_streak: 0, total_points: 0 },
      weakTopics: weakTopics ?? [],
    })
  }

  // ── VELİ RAPORU ──
  if (type === 'parent') {
    if (!targetId) {
      // Tüm çocukların özet listesi
      const { data: links } = await adminClient
        .from('parent_children')
        .select('child_id, nickname')
        .eq('parent_id', user.id)

      if (!links?.length) return NextResponse.json({ type: 'parent', children: [] })

      const children = await Promise.all(links.map(async (l: any) => {
        const { data: p } = await adminClient.from('profiles').select('name, grade').eq('id', l.child_id).maybeSingle()
        const stats = await getUserStats(l.child_id)
        const { data: streak } = await adminClient.from('streaks').select('current_streak').eq('user_id', l.child_id).maybeSingle()
        return {
          child_id: l.child_id,
          nickname: l.nickname || p?.name,
          name: p?.name,
          grade: p?.grade,
          streak: streak?.current_streak ?? 0,
          ...stats,
        }
      }))
      return NextResponse.json({ type: 'parent', children })
    }

    // Belirli çocuğun detaylı raporu
    const { data: link } = await adminClient.from('parent_children').select('nickname').eq('parent_id', user.id).eq('child_id', targetId).maybeSingle()
    if (!link) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    const { data: p } = await adminClient.from('profiles').select('name, grade').eq('id', targetId).maybeSingle()
    const stats = await getUserStats(targetId)
    const { data: streak } = await adminClient.from('streaks').select('current_streak, longest_streak, total_points').eq('user_id', targetId).maybeSingle()
    const { data: weakTopics } = await adminClient.from('weak_topics').select('topic, subject, wrong_count, total_count').eq('user_id', targetId).order('wrong_count', { ascending: false }).limit(5)
    return NextResponse.json({ type: 'parent', name: p?.name, grade: p?.grade, nickname: link.nickname, stats, streak, weakTopics })
  }

  // ── ÖĞRETMEN RAPORU ──
  if (type === 'teacher') {
    const { data: teacher } = await adminClient.from('teachers').select('id').eq('user_id', user.id).maybeSingle()
    if (!teacher) return NextResponse.json({ error: 'Not a teacher' }, { status: 403 })

    const classId = targetId || searchParams.get('classId')
    if (!classId) {
      const { data: cls } = await adminClient.from('classrooms').select('id, name').eq('teacher_id', teacher.id)
      return NextResponse.json({ type: 'teacher', classrooms: cls ?? [] })
    }

    const { data: members } = await adminClient.from('classroom_students').select('student_id').eq('classroom_id', classId)
    if (!members?.length) return NextResponse.json({ type: 'teacher', students: [] })

    const students = await Promise.all(members.map(async (m: any) => {
      const { data: p } = await adminClient.from('profiles').select('name, grade').eq('id', m.student_id).maybeSingle()
      const stats = await getUserStats(m.student_id)
      const { data: streak } = await adminClient.from('streaks').select('current_streak').eq('user_id', m.student_id).maybeSingle()
      return { student_id: m.student_id, name: p?.name, grade: p?.grade, streak: streak?.current_streak ?? 0, ...stats }
    }))
    return NextResponse.json({ type: 'teacher', students: students.sort((a, b) => b.avgPct - a.avgPct) })
  }

  // ── ADMİN RAPORU ──
  if (type === 'admin') {
    if (!profile.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [
      { count: totalUsers },
      { count: premiumUsers },
      { count: totalSessions },
      { data: todaySessions },
      { data: avgData },
    ] = await Promise.all([
      adminClient.from('profiles').select('*', { count: 'exact', head: true }),
      adminClient.from('profiles').select('*', { count: 'exact', head: true }).eq('plan', 'premium'),
      // ✅ completed: true filtresi — gerçek tamamlanan testler
      adminClient.from('quiz_sessions').select('*', { count: 'exact', head: true }).eq('completed', true),
      adminClient.from('quiz_sessions').select('id').eq('completed', true).gte('created_at', new Date().toISOString().split('T')[0]),
      adminClient.from('quiz_sessions').select('pct').eq('completed', true),
    ])

    const avgPct = avgData?.length
      ? Math.round(avgData.reduce((a, x) => a + (x.pct || 0), 0) / avgData.length) : 0

    // Son 7 gün günlük test sayısı
    const daily: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      daily[d.toISOString().split('T')[0]] = 0
    }
    const { data: weekSessions } = await adminClient
      .from('quiz_sessions')
      .select('created_at')
      .eq('completed', true)
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
    weekSessions?.forEach((s: any) => {
      const d = s.created_at.split('T')[0]
      if (daily[d] !== undefined) daily[d]++
    })

    return NextResponse.json({
      type: 'admin',
      totalUsers: totalUsers ?? 0,
      premiumUsers: premiumUsers ?? 0,
      freeUsers: (totalUsers ?? 0) - (premiumUsers ?? 0),
      totalSessions: totalSessions ?? 0,
      todaySessions: todaySessions?.length ?? 0,
      avgPct,
      dailyChart: Object.entries(daily).map(([date, count]) => ({ date, count })),
    })
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
