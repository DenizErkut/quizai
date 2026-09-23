import type { SupabaseClient } from '@supabase/supabase-js'
import { computeAutonomousGoals, type AutonomousGoal } from './study-plan-generator'
import { checkDisengagement, type DisengagementSignal } from './disengagement-risk'

export interface CoachSession { topic: string; pct: number; score: number; questionCount: number; createdAt: string }
export interface PeriodSummary { sessions: number; questions: number; averagePct: number | null }
export interface CoachHistorySummary {
  sourceWindowDays: number; totalSessions: number; totalQuestions: number; activeDays: number
  last7Days: PeriodSummary; previous7Days: PeriodSummary; last30Days: PeriodSummary; last90Days: PeriodSummary
  trendPctPoints: number | null
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data'
  forecastConfidence: 'high' | 'medium' | 'low' | 'insufficient_data'
  topics: Array<{ topic: string; sessions: number; questions: number; averagePct: number; recentAveragePct: number | null }>
}
// 23 Eylül 2026 (12. güncelleme) — Deniz'in isteği: "Prof Prati öğrencinin
// tüm hareketli verilerine ulaşabilmeli — anlık test, AUS, canlı quiz ve
// sınav simülasyonu ve sesli kitapta çözdüğü tek sorulara bile." Önceden
// buildCoachContext SADECE quiz_sessions'a bakıyordu; koç diğer dört
// aktivite türünü hiç görmüyordu. Bu tip, o dört kaynaktan (open_ended_
// sessions=AUS, live_quiz_answers=canlı quiz, exam_sessions=sınav
// simülasyonu, reading_sessions=sesli kitap) gelen tek bir birleşik
// zaman çizelgesi temsil ediyor.
export interface ActivityItem {
  kind: 'open_ended' | 'live_quiz' | 'exam' | 'reading'
  label: string
  pct: number | null
  detail: string
  createdAt: string
}

export interface CoachContext {
  displayName: string; grade: string | null; language: string | null
  streak: { current: number; longest: number; lastActivityDate: string | null }
  disengagement: DisengagementSignal; goals: AutonomousGoal[]
  recentSessions: CoachSession[]; history: CoachHistorySummary
  otherActivity: ActivityItem[]
}

const DAY_MS = 86_400_000
function period(sessions: CoachSession[], from: number, to: number, now: number): PeriodSummary {
  const rows = sessions.filter(s => { const age = now - new Date(s.createdAt).getTime(); return age >= from * DAY_MS && age < to * DAY_MS })
  return { sessions: rows.length, questions: rows.reduce((n, s) => n + s.questionCount, 0), averagePct: rows.length ? rows.reduce((n, s) => n + s.pct, 0) / rows.length : null }
}

export function summarizeCoachHistory(sessions: CoachSession[], now = Date.now()): CoachHistorySummary {
  const last7Days = period(sessions, 0, 7, now), previous7Days = period(sessions, 7, 14, now)
  const last30Days = period(sessions, 0, 30, now), last90Days = period(sessions, 0, 90, now)
  const trendPctPoints = last7Days.averagePct !== null && previous7Days.averagePct !== null ? last7Days.averagePct - previous7Days.averagePct : null
  const trend = trendPctPoints === null ? 'insufficient_data' : trendPctPoints >= 5 ? 'improving' : trendPctPoints <= -5 ? 'declining' : 'stable'
  const grouped = new Map<string, CoachSession[]>()
  for (const session of sessions) { const key = session.topic?.trim() || 'Konu belirtilmemiş'; grouped.set(key, [...(grouped.get(key) ?? []), session]) }
  const topics = [...grouped.entries()].map(([topic, rows]) => ({
    topic, sessions: rows.length, questions: rows.reduce((n, s) => n + s.questionCount, 0),
    averagePct: rows.reduce((n, s) => n + s.pct, 0) / rows.length, recentAveragePct: period(rows, 0, 30, now).averagePct,
  })).sort((a, b) => b.sessions - a.sessions).slice(0, 12)
  const forecastConfidence = last90Days.sessions >= 20 && last90Days.questions >= 150 ? 'high' : last90Days.sessions >= 10 && last90Days.questions >= 75 ? 'medium' : last90Days.sessions >= 4 ? 'low' : 'insufficient_data'
  return { sourceWindowDays: 365, totalSessions: sessions.length, totalQuestions: sessions.reduce((n, s) => n + s.questionCount, 0), activeDays: new Set(sessions.map(s => s.createdAt.slice(0, 10))).size, last7Days, previous7Days, last30Days, last90Days, trendPctPoints, trend, forecastConfidence, topics }
}

// Açık Uçlu Sorular (AUS) — sadece notlandırılmış (graded_at dolu) oturumlar
// gerçek bir sonuç sayılır; henüz cevaplanmamış/notlandırılmamış olanlar
// "aktivite" değil, bekleyen bir ödev — buraya karışmasın.
async function loadOpenEndedActivity(supabase: SupabaseClient, userId: string, since: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('open_ended_sessions')
    .select('subject, topic, total_earned, total_possible, graded_at')
    .eq('user_id', userId)
    .not('graded_at', 'is', null)
    .gte('graded_at', since)
    .order('graded_at', { ascending: false })
    .limit(20)
  return ((data as any[]) ?? []).map(r => {
    const possible = Number(r.total_possible ?? 0)
    const earned = Number(r.total_earned ?? 0)
    const p = possible > 0 ? (earned / possible) * 100 : null
    return {
      kind: 'open_ended' as const,
      label: `${r.subject ? `${r.subject} — ` : ''}${r.topic || 'Açık uçlu soru'}`,
      pct: p,
      detail: `AUS · ${p === null ? 'notlandırılmadı' : `%${Math.round(p)}`}`,
      createdAt: r.graded_at,
    }
  })
}

// Canlı quiz — live_quiz_answers satır bazlı (soru bazlı); question_index
// -1 sadece "katıldı" marker'ı, gerçek cevap değil, hariç tutulur. Aynı
// live_quiz_id altındaki satırlar JS'te tek bir aktivite kaydına toplanır.
async function loadLiveQuizActivity(supabase: SupabaseClient, userId: string, since: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('live_quiz_answers')
    .select('live_quiz_id, is_correct, answered_at, live_quizzes(topic)')
    .eq('user_id', userId)
    .neq('question_index', -1)
    .gte('answered_at', since)
    .order('answered_at', { ascending: false })
    .limit(300)
  const grouped = new Map<string, { topic: string; correct: number; total: number; latest: string }>()
  for (const row of (data as any[]) ?? []) {
    const key = row.live_quiz_id
    const topic = row.live_quizzes?.topic || 'Canlı quiz'
    const g = grouped.get(key) ?? { topic, correct: 0, total: 0, latest: row.answered_at }
    g.total += 1
    if (row.is_correct) g.correct += 1
    if (row.answered_at > g.latest) g.latest = row.answered_at
    grouped.set(key, g)
  }
  return [...grouped.values()].map(g => ({
    kind: 'live_quiz' as const,
    label: g.topic,
    pct: g.total > 0 ? (g.correct / g.total) * 100 : null,
    detail: `Canlı quiz · ${g.correct}/${g.total} doğru`,
    createdAt: g.latest,
  }))
}

// Sınav simülasyonu (LGS/TYT/AYT/YDT/KPSS tam deneme) — sadece tamamlanmış.
async function loadExamActivity(supabase: SupabaseClient, userId: string, since: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('exam_sessions')
    .select('exam_type, estimated_score, completed_at')
    .eq('user_id', userId)
    .eq('completed', true)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(10)
  return ((data as any[]) ?? []).map(r => ({
    kind: 'exam' as const,
    label: `${r.exam_type} deneme sınavı`,
    pct: null,
    detail: `Sınav simülasyonu · tahmini puan ${Math.round(Number(r.estimated_score ?? 0))}`,
    createdAt: r.completed_at,
  }))
}

// Sesli Kitap — dinleme sırasındaki dikkat sorularının doğruluğu; başlık
// için reading_materials'a ayrı bir sorguyla bakılıyor (embed FK adının
// PostgREST şema önbelleğinde garanti olmaması ihtimaline karşı daha
// sağlam bir yol).
async function loadReadingActivity(supabase: SupabaseClient, userId: string, since: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('reading_sessions')
    .select('material_id, correct_count, total_questions, completed, last_activity_at')
    .eq('user_id', userId)
    .gt('total_questions', 0)
    .gte('last_activity_at', since)
    .order('last_activity_at', { ascending: false })
    .limit(20)
  const rows = (data as any[]) ?? []
  if (!rows.length) return []
  const materialIds = [...new Set(rows.map(r => r.material_id).filter(Boolean))]
  const { data: materials } = await supabase.from('reading_materials').select('id, title').in('id', materialIds)
  const titleById = new Map(((materials as any[]) ?? []).map(m => [m.id, m.title]))
  return rows.map(r => {
    const total = Number(r.total_questions ?? 0)
    const correct = Number(r.correct_count ?? 0)
    const p = total > 0 ? (correct / total) * 100 : null
    return {
      kind: 'reading' as const,
      label: titleById.get(r.material_id) || 'Sesli Kitap',
      pct: p,
      detail: `Sesli Kitap · ${correct}/${total} doğru${r.completed ? '' : ' (yarım kaldı)'}`,
      createdAt: r.last_activity_at,
    }
  })
}

export async function buildCoachContext(supabase: SupabaseClient, userId: string, opts: { displayName: string; grade?: string | null; language?: string | null }): Promise<CoachContext> {
  const since = new Date(Date.now() - 365 * DAY_MS).toISOString()
  const [streakRes, disengagement, goals, sessionsRes, openEnded, liveQuiz, exam, reading] = await Promise.all([
    supabase.from('streaks').select('current_streak, longest_streak, last_activity_date').eq('user_id', userId).maybeSingle(),
    checkDisengagement(supabase, userId), computeAutonomousGoals(supabase, userId, 4),
    supabase.from('quiz_sessions').select('topic, pct, score, question_count, created_at').eq('user_id', userId).eq('completed', true).gte('created_at', since).order('created_at', { ascending: false }).limit(500),
    loadOpenEndedActivity(supabase, userId, since).catch(() => []),
    loadLiveQuizActivity(supabase, userId, since).catch(() => []),
    loadExamActivity(supabase, userId, since).catch(() => []),
    loadReadingActivity(supabase, userId, since).catch(() => []),
  ])
  const streakRow = (streakRes as any)?.data
  const sessions: CoachSession[] = ((sessionsRes as any)?.data ?? []).map((s: any) => ({ topic: s.topic, pct: Number(s.pct ?? 0), score: Number(s.score ?? 0), questionCount: Number(s.question_count ?? 0), createdAt: s.created_at }))
  const otherActivity = [...openEnded, ...liveQuiz, ...exam, ...reading]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 15)
  return { displayName: opts.displayName, grade: opts.grade ?? null, language: opts.language ?? null, streak: { current: streakRow?.current_streak ?? 0, longest: streakRow?.longest_streak ?? 0, lastActivityDate: streakRow?.last_activity_date ?? null }, disengagement, goals, recentSessions: sessions.slice(0, 10), history: summarizeCoachHistory(sessions), otherActivity }
}

const pct = (v: number | null) => v === null ? 'veri yok' : `%${Math.round(v)}`
export function formatCoachContextForPrompt(ctx: CoachContext): string {
  const h = ctx.history
  const lines = [
    `Öğrenci: ${ctx.displayName}${ctx.grade ? ` (${ctx.grade})` : ''}`,
    `Güncel çalışma serisi: ${ctx.streak.current} gün (en uzun: ${ctx.streak.longest} gün)`,
    `Geçmiş veri kapsamı: son ${h.sourceWindowDays} gün içindeki ${h.totalSessions} tamamlanmış test, ${h.totalQuestions} soru, ${h.activeDays} aktif gün.`,
    `Son 7 gün: ${h.last7Days.sessions} test / ${h.last7Days.questions} soru / ortalama ${pct(h.last7Days.averagePct)}.`,
    `Önceki 7 gün: ${h.previous7Days.sessions} test / ${h.previous7Days.questions} soru / ortalama ${pct(h.previous7Days.averagePct)}.`,
    `Son 30 gün: ${h.last30Days.sessions} test / ${h.last30Days.questions} soru / ortalama ${pct(h.last30Days.averagePct)}.`,
    `Son 90 gün: ${h.last90Days.sessions} test / ${h.last90Days.questions} soru / ortalama ${pct(h.last90Days.averagePct)}.`,
    `Kısa dönem eğilim: ${h.trend}${h.trendPctPoints === null ? '' : ` (${h.trendPctPoints >= 0 ? '+' : ''}${Math.round(h.trendPctPoints)} puan)`}; tahmin güveni: ${h.forecastConfidence}.`,
  ]
  if (ctx.disengagement.isDisengaging) lines.push(`Dikkat: ${ctx.disengagement.daysSinceLastActivity} gündür aktif değil.`)
  if (h.topics.length) { lines.push('Konu geçmişi:'); for (const t of h.topics) lines.push(`- ${t.topic}: ${t.sessions} test, ${t.questions} soru, genel ${pct(t.averagePct)}, son 30 gün ${pct(t.recentAveragePct)}`) }
  if (ctx.recentSessions.length) lines.push(`Son testler: ${ctx.recentSessions.slice(0, 5).map(s => `${s.topic} (${pct(s.pct)})`).join(', ')}`)
  else lines.push('Henüz tamamlanmış bir testi yok.')
  if (ctx.goals.length) { lines.push('Sistemin hesapladığı öncelikler:'); for (const g of ctx.goals) lines.push(`- ${g.topic}: ${g.reason}${Number.isFinite(g.masteryScore) ? ` [mastery: ${Math.round(g.masteryScore)}/100]` : ''}`) }
  // 12. güncelleme — "anlık test" (quiz_sessions) dışındaki dört aktivite
  // türü de (AUS, canlı quiz, sınav simülasyonu, sesli kitap) artık koçun
  // gördüğü veriye dahil. Öğrenci "son testleri değerlendir" dediğinde
  // koç artık SADECE quiz_sessions'a değil, bu birleşik listeye bakabiliyor.
  if (ctx.otherActivity.length) {
    lines.push('Diğer aktiviteler (test dışı — AUS, canlı quiz, sınav simülasyonu, sesli kitap):')
    for (const a of ctx.otherActivity) lines.push(`- [${a.detail}] ${a.label}${a.pct !== null ? ` — ${pct(a.pct)}` : ''} (${new Date(a.createdAt).toLocaleDateString('tr-TR')})`)
  }
  lines.push('Tahminleri kesin sonuç gibi sunma. Tahmin güveni düşük/yetersiz ise bunu açıkça belirt.')
  return lines.join('\n')
}
