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
export interface CoachContext {
  displayName: string; grade: string | null; language: string | null
  streak: { current: number; longest: number; lastActivityDate: string | null }
  disengagement: DisengagementSignal; goals: AutonomousGoal[]
  recentSessions: CoachSession[]; history: CoachHistorySummary
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

export async function buildCoachContext(supabase: SupabaseClient, userId: string, opts: { displayName: string; grade?: string | null; language?: string | null }): Promise<CoachContext> {
  const since = new Date(Date.now() - 365 * DAY_MS).toISOString()
  const [streakRes, disengagement, goals, sessionsRes] = await Promise.all([
    supabase.from('streaks').select('current_streak, longest_streak, last_activity_date').eq('user_id', userId).maybeSingle(),
    checkDisengagement(supabase, userId), computeAutonomousGoals(supabase, userId, 4),
    supabase.from('quiz_sessions').select('topic, pct, score, question_count, created_at').eq('user_id', userId).eq('completed', true).gte('created_at', since).order('created_at', { ascending: false }).limit(500),
  ])
  const streakRow = (streakRes as any)?.data
  const sessions: CoachSession[] = ((sessionsRes as any)?.data ?? []).map((s: any) => ({ topic: s.topic, pct: Number(s.pct ?? 0), score: Number(s.score ?? 0), questionCount: Number(s.question_count ?? 0), createdAt: s.created_at }))
  return { displayName: opts.displayName, grade: opts.grade ?? null, language: opts.language ?? null, streak: { current: streakRow?.current_streak ?? 0, longest: streakRow?.longest_streak ?? 0, lastActivityDate: streakRow?.last_activity_date ?? null }, disengagement, goals, recentSessions: sessions.slice(0, 10), history: summarizeCoachHistory(sessions) }
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
  lines.push('Tahminleri kesin sonuç gibi sunma. Tahmin güveni düşük/yetersiz ise bunu açıkça belirt.')
  return lines.join('\n')
}
