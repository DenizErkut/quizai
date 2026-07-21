// lib/reports-data.ts
// "RAPORLAR" başlığı altındaki yeni rapor türlerinin veri katmanı. Her
// fonksiyon bir roster (ReportStudentBase[]) alır, ilgili raporun JSON'a
// hazır verisini döner. Kimlik/roster oluşturma lib/report-context.ts'te.

import { createClient } from '@supabase/supabase-js'
import { ReportStudentBase } from '@/lib/student-reports'
import { DIGER_DERS } from '@/lib/student-report-topics'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function ids(roster: ReportStudentBase[]) { return roster.map(s => s.id) }
function nameOf(roster: ReportStudentBase[]) { return new Map(roster.map(s => [s.id, s])) }

// ────────────────────────────────────────────────────────────────────────
// 1) İLERLEME — son 8 haftanın haftalık ortalama başarı % trendi
// ────────────────────────────────────────────────────────────────────────
export async function buildProgressReport(roster: ReportStudentBase[]) {
  if (!roster.length) return { weeklyTrend: [], students: [] }
  const since = new Date(); since.setDate(since.getDate() - 56) // 8 hafta
  const { data: sessions } = await supabaseAdmin
    .from('quiz_sessions').select('user_id, pct, created_at')
    .eq('completed', true).in('user_id', ids(roster)).gte('created_at', since.toISOString())

  function weekKey(d: Date) {
    const monday = new Date(d)
    const day = (monday.getDay() + 6) % 7 // Pazartesi=0
    monday.setDate(monday.getDate() - day)
    return monday.toISOString().slice(0, 10)
  }

  const weekly = new Map<string, { sum: number; count: number }>()
  const perStudent = new Map<string, { firstHalf: { sum: number; count: number }; secondHalf: { sum: number; count: number } }>()
  const midpoint = new Date(); midpoint.setDate(midpoint.getDate() - 28)

  for (const s of (sessions ?? [])) {
    const d = new Date(s.created_at)
    const wk = weekKey(d)
    const cur = weekly.get(wk) ?? { sum: 0, count: 0 }
    cur.sum += s.pct ?? 0; cur.count += 1
    weekly.set(wk, cur)

    if (!perStudent.has(s.user_id)) perStudent.set(s.user_id, { firstHalf: { sum: 0, count: 0 }, secondHalf: { sum: 0, count: 0 } })
    const bucket = perStudent.get(s.user_id)!
    const half = d < midpoint ? bucket.firstHalf : bucket.secondHalf
    half.sum += s.pct ?? 0; half.count += 1
  }

  const weeklyTrend = [...weekly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => ({ week, avgPct: v.count ? Math.round(v.sum / v.count) : null, testCount: v.count }))

  const nm = nameOf(roster)
  const students = [...perStudent.entries()].map(([uid, b]) => {
    const before = b.firstHalf.count ? Math.round(b.firstHalf.sum / b.firstHalf.count) : null
    const after = b.secondHalf.count ? Math.round(b.secondHalf.sum / b.secondHalf.count) : null
    return {
      id: uid, fullName: nm.get(uid)?.fullName ?? 'İsimsiz',
      before, after,
      delta: before != null && after != null ? after - before : null,
    }
  }).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)) // en çok düşenler önce

  return { weeklyTrend, students }
}

// ────────────────────────────────────────────────────────────────────────
// 2) ZAYIF KONULAR — roster genelinde en çok yanlış yapılan konular
// ────────────────────────────────────────────────────────────────────────
export async function buildWeakTopicsReport(roster: ReportStudentBase[]) {
  if (!roster.length) return { topics: [] }
  const { data } = await supabaseAdmin
    .from('weak_topics').select('user_id, topic, subject, wrong_count, total_count')
    .in('user_id', ids(roster))

  const byTopic = new Map<string, { subject: string; wrong: number; total: number; studentIds: Set<string> }>()
  for (const row of (data ?? [])) {
    const key = `${row.subject || DIGER_DERS}::${row.topic}`
    const cur = byTopic.get(key) ?? { subject: row.subject || DIGER_DERS, wrong: 0, total: 0, studentIds: new Set<string>() }
    cur.wrong += row.wrong_count ?? 0
    cur.total += row.total_count ?? 0
    cur.studentIds.add(row.user_id)
    byTopic.set(key, cur)
  }

  const topics = [...byTopic.entries()]
    .map(([key, v]) => ({
      topic: key.split('::').slice(1).join('::'),
      subject: v.subject,
      wrongCount: v.wrong,
      totalCount: v.total,
      errorRate: v.total > 0 ? Math.round((v.wrong / v.total) * 100) : 0,
      studentCount: v.studentIds.size,
    }))
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 20)

  return { topics }
}

// ────────────────────────────────────────────────────────────────────────
// 3) ÖDEV TAMAMLAMA KARNESİ
// ────────────────────────────────────────────────────────────────────────
export async function buildAssignmentsReport(roster: ReportStudentBase[], classroomIds: string[]) {
  if (!classroomIds.length) return { assignments: [], students: [] }
  const { data: assignments } = await supabaseAdmin
    .from('assignments').select('id, title, topic, classroom_id, due_date, created_at')
    .in('classroom_id', classroomIds).order('due_date', { ascending: false })

  if (!assignments?.length) return { assignments: [], students: [] }

  const { data: completions } = await supabaseAdmin
    .from('assignment_completions').select('assignment_id, student_id, pct, completed_at')
    .in('assignment_id', assignments.map((a: any) => a.id))

  const completionsByAssignment = new Map<string, any[]>()
  const completedByStudent = new Map<string, number>()
  for (const c of (completions ?? [])) {
    if (!completionsByAssignment.has(c.assignment_id)) completionsByAssignment.set(c.assignment_id, [])
    completionsByAssignment.get(c.assignment_id)!.push(c)
    completedByStudent.set(c.student_id, (completedByStudent.get(c.student_id) ?? 0) + 1)
  }

  const assignmentRows = assignments.map((a: any) => {
    const comps = completionsByAssignment.get(a.id) ?? []
    const avgPct = comps.length ? Math.round(comps.reduce((s, c) => s + (c.pct ?? 0), 0) / comps.length) : null
    return {
      id: a.id, title: a.title, topic: a.topic, dueDate: a.due_date,
      completedCount: comps.length, avgPct,
    }
  })

  const students = roster.map(s => ({
    id: s.id, fullName: s.fullName,
    assignedCount: assignments.length,
    completedCount: completedByStudent.get(s.id) ?? 0,
  })).sort((a, b) => (a.completedCount / (a.assignedCount || 1)) - (b.completedCount / (b.assignedCount || 1)))

  return { assignments: assignmentRows, students }
}

// ────────────────────────────────────────────────────────────────────────
// 4) CANLI QUIZ RAPORU
// ────────────────────────────────────────────────────────────────────────
export async function buildLiveQuizReport(classroomIds: string[]) {
  if (!classroomIds.length) return { quizzes: [] }
  const { data: quizzes } = await supabaseAdmin
    .from('live_quizzes').select('id, topic, classroom_id, status, created_at, finished_at')
    .in('classroom_id', classroomIds).order('created_at', { ascending: false }).limit(30)

  if (!quizzes?.length) return { quizzes: [] }

  const { data: answers } = await supabaseAdmin
    .from('live_quiz_answers').select('live_quiz_id, user_id, is_correct')
    .in('live_quiz_id', quizzes.map((q: any) => q.id))

  const statsByQuiz = new Map<string, { participants: Set<string>; correct: number; total: number }>()
  for (const a of (answers ?? [])) {
    const cur = statsByQuiz.get(a.live_quiz_id) ?? { participants: new Set<string>(), correct: 0, total: 0 }
    cur.participants.add(a.user_id)
    cur.total += 1
    if (a.is_correct) cur.correct += 1
    statsByQuiz.set(a.live_quiz_id, cur)
  }

  const rows = quizzes.map((q: any) => {
    const stat = statsByQuiz.get(q.id)
    return {
      id: q.id, topic: q.topic, status: q.status, date: q.created_at,
      participantCount: stat?.participants.size ?? 0,
      accuracyPct: stat && stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : null,
    }
  })

  return { quizzes: rows }
}

// ────────────────────────────────────────────────────────────────────────
// 5) DEVAMSIZLIK / PASİFLİK
// ────────────────────────────────────────────────────────────────────────
export async function buildInactivityReport(roster: ReportStudentBase[]) {
  if (!roster.length) return { students: [] }
  const { data: streaks } = await supabaseAdmin
    .from('streaks').select('user_id, last_activity_date, current_streak').in('user_id', ids(roster))
  const streakMap = new Map((streaks ?? []).map((s: any) => [s.user_id, s]))

  const today = new Date()
  const students = roster.map(s => {
    const row = streakMap.get(s.id)
    const lastActive: string | null = row?.last_activity_date ?? null
    const daysInactive = lastActive
      ? Math.floor((today.getTime() - new Date(lastActive).getTime()) / 86400000)
      : null // hiç aktivite yok
    return { id: s.id, fullName: s.fullName, lastActive, daysInactive, currentStreak: row?.current_streak ?? 0 }
  }).filter(s => s.daysInactive === null || s.daysInactive >= 7)
    .sort((a, b) => (b.daysInactive ?? 9999) - (a.daysInactive ?? 9999))

  return { students }
}

// ────────────────────────────────────────────────────────────────────────
// 6) SESLİ OKUMA RAPORU
// ────────────────────────────────────────────────────────────────────────
export async function buildReadingReport(roster: ReportStudentBase[]) {
  if (!roster.length) return { students: [] }
  const [sessionsRes, checksRes] = await Promise.all([
    supabaseAdmin.from('reading_sessions').select('user_id, completed, correct_count, total_questions').in('user_id', ids(roster)),
    supabaseAdmin.from('reading_attention_checks').select('user_id, is_correct').in('user_id', ids(roster)),
  ])

  const sessionStats = new Map<string, { completed: number; correct: number; total: number }>()
  for (const r of (sessionsRes.data ?? [])) {
    const cur = sessionStats.get(r.user_id) ?? { completed: 0, correct: 0, total: 0 }
    if (r.completed) cur.completed += 1
    cur.correct += r.correct_count ?? 0
    cur.total += r.total_questions ?? 0
    sessionStats.set(r.user_id, cur)
  }
  const checkStats = new Map<string, { correct: number; total: number }>()
  for (const c of (checksRes.data ?? [])) {
    const cur = checkStats.get(c.user_id) ?? { correct: 0, total: 0 }
    cur.total += 1
    if (c.is_correct) cur.correct += 1
    checkStats.set(c.user_id, cur)
  }

  const students = roster.map(s => {
    const sess = sessionStats.get(s.id)
    const chk = checkStats.get(s.id)
    return {
      id: s.id, fullName: s.fullName,
      materialsCompleted: sess?.completed ?? 0,
      attentionAccuracyPct: chk && chk.total > 0 ? Math.round((chk.correct / chk.total) * 100) : null,
      attentionChecksAnswered: chk?.total ?? 0,
    }
  }).sort((a, b) => b.materialsCompleted - a.materialsCompleted)

  return { students }
}

// ────────────────────────────────────────────────────────────────────────
// 7) NOT KARŞILAŞTIRMA — veli/öğrenci beyanı (grade_notes) vs kurum kaydı (student_grades)
// ────────────────────────────────────────────────────────────────────────
export async function buildGradeComparisonReport(roster: ReportStudentBase[], importId: string | null) {
  if (!roster.length) return { students: [] }
  const [notesRes, gradesRes] = await Promise.all([
    supabaseAdmin.from('grade_notes').select('user_id, subject, term1_avg, term2_avg').in('user_id', ids(roster)),
    importId
      ? supabaseAdmin.from('student_grades').select('student_id, subject, value_numeric').eq('import_id', importId).in('student_id', ids(roster))
      : Promise.resolve({ data: [] as any[] }),
  ])

  const selfReported = new Map<string, Map<string, number | null>>()
  for (const n of (notesRes.data ?? [])) {
    if (!selfReported.has(n.user_id)) selfReported.set(n.user_id, new Map())
    const avg = [n.term1_avg, n.term2_avg].filter((v: any) => v != null)
    const combined = avg.length ? avg.reduce((a: number, b: number) => a + b, 0) / avg.length : null
    selfReported.get(n.user_id)!.set(n.subject, combined)
  }

  const imported = new Map<string, Map<string, number | null>>()
  for (const g of (gradesRes.data ?? [])) {
    if (!imported.has(g.student_id)) imported.set(g.student_id, new Map())
    imported.get(g.student_id)!.set(g.subject, g.value_numeric)
  }

  const students = roster
    .map(s => {
      const own = selfReported.get(s.id)
      const inst = imported.get(s.id)
      if (!own && !inst) return null
      const subjects = new Set([...(own?.keys() ?? []), ...(inst?.keys() ?? [])])
      const rows = [...subjects].map(subj => {
        const selfVal = own?.get(subj) ?? null
        const instVal = inst?.get(subj) ?? null
        return {
          subject: subj, selfReported: selfVal, institutionRecord: instVal,
          diff: selfVal != null && instVal != null ? Math.round((selfVal - instVal) * 10) / 10 : null,
        }
      })
      return { id: s.id, fullName: s.fullName, subjects: rows }
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)

  return { students }
}

// ────────────────────────────────────────────────────────────────────────
// 8) SINIF / SEVİYE KARŞILAŞTIRMA
// groupField: teacher kapsamında 'classroomName', kurum kapsamında 'grade'
// ────────────────────────────────────────────────────────────────────────
export async function buildClassroomCompareReport(roster: ReportStudentBase[], groupField: 'classroomName' | 'grade') {
  if (!roster.length) return { groups: [] }
  const { data: sessions } = await supabaseAdmin
    .from('quiz_sessions').select('user_id, pct').eq('completed', true).in('user_id', ids(roster))

  const pctByStudent = new Map<string, { sum: number; count: number }>()
  for (const s of (sessions ?? [])) {
    const cur = pctByStudent.get(s.user_id) ?? { sum: 0, count: 0 }
    cur.sum += s.pct ?? 0; cur.count += 1
    pctByStudent.set(s.user_id, cur)
  }

  const groups = new Map<string, { sum: number; count: number; studentCount: number }>()
  for (const s of roster) {
    const key = (s as any)[groupField] || 'Belirtilmemiş'
    const stat = pctByStudent.get(s.id)
    const cur = groups.get(key) ?? { sum: 0, count: 0, studentCount: 0 }
    cur.studentCount += 1
    if (stat) { cur.sum += stat.sum; cur.count += stat.count }
    groups.set(key, cur)
  }

  const rows = [...groups.entries()]
    .map(([name, v]) => ({ name, studentCount: v.studentCount, avgPct: v.count > 0 ? Math.round(v.sum / v.count) : null, testCount: v.count }))
    .sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))

  return { groups: rows }
}
