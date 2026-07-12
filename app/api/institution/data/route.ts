// app/api/institution/data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Admin kontrolü
  const { data: instUser } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!instUser) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  // Kurum bilgisi
  const { data: institution } = await supabaseAdmin
    .from('institutions')
    .select('*')
    .eq('id', instUser.institution_id)
    .single()

  // Kuruma kayıtlı öğrenciler
  const { data: members } = await supabaseAdmin
    .from('institution_users')
    .select('user_id, joined_at')
    .eq('institution_id', instUser.institution_id)
    .eq('role', 'student')

  if (!members?.length) {
    return NextResponse.json({ institution, students: [], analytics: null })
  }

  const userIds = members.map((m: any) => m.user_id)

  // İsimler TR-PG'den toplu çekilir (grade/avatar Supabase'de kalır)
  const identities = await getIdentitiesBySupabaseIds(userIds)

  // Her öğrenci için profil + streak + test verileri (son 90 gün)
  const studentData = await Promise.all(userIds.map(async (uid: string) => {
    const [profileRes, streakRes, sessionsRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('grade, avatar_url').eq('id', uid).maybeSingle(),
      supabaseAdmin.from('streaks').select('current_streak').eq('user_id', uid).maybeSingle(),
      supabaseAdmin.from('quiz_sessions')
        .select('pct, score, question_count, topic, grade, created_at')
        .eq('user_id', uid)
        .eq('completed', true)
        .order('created_at', { ascending: false })
        .limit(90),
    ])
    const sessions = sessionsRes.data ?? []
    const avgPct = sessions.length ? Math.round(sessions.reduce((a: number, s: any) => a + s.pct, 0) / sessions.length) : null
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
    const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
    const weeklyTests = sessions.filter((s: any) => new Date(s.created_at) > weekAgo).length
    const prevWeekTests = sessions.filter((s: any) => new Date(s.created_at) > twoWeeksAgo && new Date(s.created_at) <= weekAgo).length

    // Konu zayıflıkları
    const topicMap: Record<string, { total: number; sumPct: number }> = {}
    for (const s of sessions) {
      const t = s.topic || 'Diğer'
      if (!topicMap[t]) topicMap[t] = { total: 0, sumPct: 0 }
      topicMap[t].total++
      topicMap[t].sumPct += s.pct
    }
    const weakTopics = Object.entries(topicMap)
      .map(([topic, d]) => ({ topic, avg: Math.round(d.sumPct / d.total), count: d.total }))
      .filter(t => t.avg < 60)
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 3)

    return {
      id: uid,
      name: identities[uid]?.full_name ?? 'İsimsiz',
      grade: profileRes.data?.grade ?? '',
      avatar_url: profileRes.data?.avatar_url ?? null,
      streak: streakRes.data?.current_streak ?? 0,
      totalTests: sessions.length,
      avgPct,
      weeklyTests,
      prevWeekTests,
      lastActive: sessions[0]?.created_at ?? null,
      weakTopics,
      sessions: sessions.slice(0, 30), // Son 30 test analiz için
    }
  }))

  // ── Kurum geneli analitik ──
  const now = new Date()
  const days7 = new Date(now); days7.setDate(days7.getDate() - 7)
  const days14 = new Date(now); days14.setDate(days14.getDate() - 14)

  // Haftalık trend (son 8 hafta)
  const allSessions = studentData.flatMap(s => s.sessions.map((sess: any) => ({ ...sess, userId: s.id })))
  const weeklyTrend: { week: string; tests: number; avgPct: number }[] = []
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - i * 7)
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() - (i - 1) * 7)
    const weekSessions = allSessions.filter(s => {
      const d = new Date(s.created_at)
      return d >= weekStart && d < weekEnd
    })
    weeklyTrend.push({
      week: weekStart.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }),
      tests: weekSessions.length,
      avgPct: weekSessions.length ? Math.round(weekSessions.reduce((a, s) => a + s.pct, 0) / weekSessions.length) : 0,
    })
  }

  // Sınıf bazlı kırılım
  const gradeMap: Record<string, { count: number; sumPct: number; tests: number }> = {}
  for (const s of studentData) {
    const g = s.grade || 'Belirtilmemiş'
    if (!gradeMap[g]) gradeMap[g] = { count: 0, sumPct: 0, tests: 0 }
    gradeMap[g].count++
    gradeMap[g].tests += s.totalTests
    if (s.avgPct !== null) gradeMap[g].sumPct += s.avgPct
  }
  const gradeBreakdown = Object.entries(gradeMap)
    .map(([grade, d]) => ({ grade, count: d.count, tests: d.tests, avgPct: d.count > 0 ? Math.round(d.sumPct / d.count) : 0 }))
    .sort((a, b) => a.grade.localeCompare(b.grade))

  // Kurum geneli konu zayıflıkları
  const institutionTopicMap: Record<string, { total: number; sumPct: number }> = {}
  for (const s of allSessions) {
    const t = s.topic || 'Diğer'
    if (!institutionTopicMap[t]) institutionTopicMap[t] = { total: 0, sumPct: 0 }
    institutionTopicMap[t].total++
    institutionTopicMap[t].sumPct += s.pct
  }
  const topicRanking = Object.entries(institutionTopicMap)
    .map(([topic, d]) => ({ topic, avg: Math.round(d.sumPct / d.total), count: d.total }))
    .filter(t => t.count >= 2)
    .sort((a, b) => a.avg - b.avg)

  // Risk öğrencileri: 7+ gün aktif değil VEYA avg < 40
  const riskStudents = studentData
    .filter(s => {
      const inactive = !s.lastActive || new Date(s.lastActive) < days7
      const lowScore = s.avgPct !== null && s.avgPct < 40
      return inactive || lowScore
    })
    .map(s => ({
      id: s.id,
      name: s.name,
      grade: s.grade,
      avgPct: s.avgPct,
      lastActive: s.lastActive,
      reason: !s.lastActive || new Date(s.lastActive) < days7 ? 'inactive' : 'lowscore',
    }))

  const analytics = {
    weeklyTrend,
    gradeBreakdown,
    topicRanking: topicRanking.slice(0, 15),
    weakTopics: topicRanking.slice(0, 5),
    strongTopics: [...topicRanking].sort((a, b) => b.avg - a.avg).slice(0, 5),
    riskStudents,
    thisWeekTests: studentData.reduce((a, s) => a + s.weeklyTests, 0),
    prevWeekTests: studentData.reduce((a, s) => a + s.prevWeekTests, 0),
  }

  // sessions'ı strip et (fazla veri)
  const studentsClean = studentData.map(({ sessions, ...rest }) => rest)

  return NextResponse.json({ institution, students: studentsClean, analytics })
}
