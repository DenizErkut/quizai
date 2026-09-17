// lib/coach-context.ts — Pratium Koç, Faz A: bağlam katmanı.
//
// 17 Eylül 2026 — Pratium Koç'u tek seferlik bir metin üretecinden çok
// turlu, eyleme geçirebilir bir sohbete dönüştürme yol haritasının ilk
// adımı (bkz. proje dokümanı: pratium-koc-sohbet-urunu-yol-haritasi.md).
//
// Amaç: koçun HER yanıtının aynı, tek ve GERÇEK veri kaynağına dayanmasını
// sağlamak. Mastery/öncelik motoru (student_recommendations, weak_topics
// fallback'i), streak ve disengagement sinyali zaten üretimde var ve
// olgun — burada yeni bir hesaplama YAPILMIYOR, var olan modüller
// (study-plan-generator, disengagement-risk) tek bir objede toplanıyor.
// Bu, LLM'in sayı/başarı uydurmasına (halüsinasyon) karşı temel savunma:
// sistem promptuna SADECE bu objeden üretilmiş metin girer.
import { SupabaseClient } from '@supabase/supabase-js'
import { computeAutonomousGoals, AutonomousGoal } from './study-plan-generator'
import { checkDisengagement, DisengagementSignal } from './disengagement-risk'

export interface CoachContext {
  displayName: string
  grade: string | null
  language: string | null
  streak: {
    current: number
    longest: number
    lastActivityDate: string | null
  }
  disengagement: DisengagementSignal
  goals: AutonomousGoal[]
  recentSessions: { topic: string; pct: number; createdAt: string }[]
}

export async function buildCoachContext(
  supabase: SupabaseClient,
  userId: string,
  opts: { displayName: string; grade?: string | null; language?: string | null }
): Promise<CoachContext> {
  const [streakRes, disengagement, goals, sessionsRes] = await Promise.all([
    supabase
      .from('streaks')
      .select('current_streak, longest_streak, last_activity_date')
      .eq('user_id', userId)
      .maybeSingle(),
    checkDisengagement(supabase, userId),
    computeAutonomousGoals(supabase, userId, 4),
    supabase
      .from('quiz_sessions')
      .select('topic, pct, created_at')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const streakRow = (streakRes as any)?.data
  const sessions = (sessionsRes as any)?.data ?? []

  return {
    displayName: opts.displayName,
    grade: opts.grade ?? null,
    language: opts.language ?? null,
    streak: {
      current: streakRow?.current_streak ?? 0,
      longest: streakRow?.longest_streak ?? 0,
      lastActivityDate: streakRow?.last_activity_date ?? null,
    },
    disengagement,
    goals,
    recentSessions: sessions.map((s: any) => ({
      topic: s.topic,
      pct: s.pct,
      createdAt: s.created_at,
    })),
  }
}

// Sistem promptuna gömülecek, insan-okunur bağlam özeti. Koç bu metnin
// DIŞINDA hiçbir sayı/başarı/konu adı kullanmamalı — bu kural
// buildCoachSystemPrompt (app/api/coach/chat/route.ts) tarafında
// talimat olarak da açıkça belirtiliyor.
export function formatCoachContextForPrompt(ctx: CoachContext): string {
  const lines: string[] = []
  lines.push(`Öğrenci: ${ctx.displayName}${ctx.grade ? ` (${ctx.grade})` : ''}`)
  lines.push(`Güncel çalışma serisi: ${ctx.streak.current} gün (en uzun serisi: ${ctx.streak.longest} gün)`)

  if (ctx.disengagement.isDisengaging) {
    lines.push(
      `Dikkat — pratik sıklığı düşmüş: son ${ctx.disengagement.daysSinceLastActivity} gündür aktif değil ` +
      `(önceki 14 günde haftalık ortalama ${ctx.disengagement.priorWeeklyAvg} test, son 14 günde ${ctx.disengagement.recentWeeklyAvg}).`
    )
  }

  if (ctx.recentSessions.length) {
    const last5 = ctx.recentSessions
      .slice(0, 5)
      .map(s => `${s.topic} (%${Math.round(s.pct)})`)
      .join(', ')
    lines.push(`Son çözdüğü testler: ${last5}`)
  } else {
    lines.push('Henüz tamamlanmış bir testi yok.')
  }

  if (ctx.goals.length) {
    lines.push('Sistem tarafından hesaplanmış öncelikli çalışma önerileri (gerekçesiyle):')
    for (const g of ctx.goals) {
      const mastery = Number.isFinite(g.masteryScore) ? ` [mastery: ${Math.round(g.masteryScore)}/100]` : ''
      lines.push(`- ${g.topic}: ${g.reason}${mastery}`)
    }
  } else {
    lines.push('Şu an sistem tarafından hesaplanmış belirgin bir öncelikli konu yok (yeterli veri birikmemiş olabilir).')
  }

  return lines.join('\n')
}
