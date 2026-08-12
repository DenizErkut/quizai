// lib/parent-summary.ts
// Veli haftalık özet e-postası için paylaşılan mantık — hem velinin kendi
// isteğiyle tetiklediği (app/api/parent/send-summary) hem de Vercel Cron ile
// otomatik çalışan (app/api/cron/weekly-parent-summary) route'lar bunu kullanır.
// Aynı hesaplama/HTML şablonunun iki yerde ayrı ayrı yazılıp zamanla
// birbirinden sapmasını önlemek için tek kaynağa çıkarıldı.
import { SupabaseClient } from '@supabase/supabase-js'
import { getTopicMastery } from './mastery'
import { generateActionSentence } from './parent-action-sentence'
import { computeWeeklyGrowth, WeeklyGrowth } from './weekly-growth'

export interface ChildWeeklySummary {
  name: string
  grade: string | null
  testCount: number
  avgPct: number | null
  weakestTopic: string | null
  sessions: Array<{ topic: string; pct: number }>
  actionSentence?: string
  weeklyGrowth?: WeeklyGrowth
}

export interface QuizSessionRow {
  user_id: string
  score: number
  pct: number
  question_count: number
  topic: string
  created_at: string
}

// Bir çocuğun haftalık oturum listesinden özet çıkarır. Hem tek-veli
// (manuel route) hem toplu-cron akışında aynı hesaplama kullanılsın diye
// saf bir fonksiyon olarak ayrıldı (DB'ye kendi başına erişmez).
export function summarizeChildSessions(
  childName: string,
  childGrade: string | null,
  sessions: QuizSessionRow[]
): ChildWeeklySummary {
  if (!sessions.length) {
    return { name: childName, grade: childGrade, testCount: 0, avgPct: null, weakestTopic: null, sessions: [] }
  }
  const avgPct = Math.round(sessions.reduce((a, s) => a + s.pct, 0) / sessions.length)
  const topicScores: Record<string, { total: number; sum: number }> = {}
  sessions.forEach(s => {
    if (!topicScores[s.topic]) topicScores[s.topic] = { total: 0, sum: 0 }
    topicScores[s.topic].total++
    topicScores[s.topic].sum += s.pct
  })
  const weakestTopic = Object.entries(topicScores)
    .map(([topic, s]) => ({ topic, avg: Math.round(s.sum / s.total) }))
    .sort((a, b) => a.avg - b.avg)[0]?.topic || null

  return {
    name: childName,
    grade: childGrade,
    testCount: sessions.length,
    avgPct,
    weakestTopic,
    sessions: sessions.slice(0, 3).map(s => ({ topic: s.topic, pct: s.pct })),
  }
}

// Haftalık Gelişim Oranı (Pazartesi-bazlı hafta karşılaştırması) — veli
// panelindeki "Haftalık Gelişim" sekmesiyle AYNI hesaplama (lib/weekly-
// growth.ts), buraya küçük bir rozet olarak ekleniyor.
function buildWeeklyGrowthBadge(g?: WeeklyGrowth): string {
  if (!g || g.thisWeekAvg == null || g.lastWeekAvg == null) return ''
  const delta = g.deltaPoints ?? 0
  const color = delta > 0 ? '#16a34a' : delta < 0 ? '#dc2626' : '#64748b'
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '—'
  const sign = delta > 0 ? '+' : ''
  return `<div style="margin-top:8px;font-size:12.5px;color:${color};font-weight:700">
    ${arrow} Haftalık gelişim: ${sign}${delta} puan <span style="font-weight:400;color:#94a3b8">(geçen hafta %${g.lastWeekAvg} → bu hafta %${g.thisWeekAvg})</span>
  </div>`
}

export function buildParentSummaryEmailHtml(parentName: string, children: ChildWeeklySummary[]): string {
  const rows = children.map(child => {
    if (child.testCount === 0) {
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0"><strong>${child.name}</strong><br><span style="color:#94a3b8;font-size:13px">Bu hafta quiz çözülmedi</span></td></tr>`
    }
    const color = (child.avgPct ?? 0) >= 75 ? '#16a34a' : (child.avgPct ?? 0) >= 50 ? '#d97706' : '#dc2626'
    return `<tr><td style="padding:16px 0;border-bottom:1px solid #e2e8f0">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><strong style="font-size:15px;color:#082465">${child.name}</strong><span style="font-size:12px;color:#94a3b8;margin-left:8px">${child.grade ?? ''}</span></div>
        <div style="font-size:28px;font-weight:900;color:${color}">%${child.avgPct}</div>
      </div>
      <div style="margin-top:8px;font-size:13px;color:#64748b">📝 ${child.testCount} test${child.weakestTopic ? ` · ⚠️ Zayıf konu: <strong>${child.weakestTopic}</strong>` : ''}</div>
      ${child.sessions.length ? `<div style="margin-top:6px;font-size:12px;color:#94a3b8">Son testler: ${child.sessions.map(s => `${s.topic} (%${s.pct})`).join(' · ')}</div>` : ''}
      ${buildWeeklyGrowthBadge(child.weeklyGrowth)}
      ${child.actionSentence ? `<div style="margin-top:10px;padding:10px 12px;background:#fef3c7;border-radius:8px;font-size:12.5px;color:#78350f">💡 ${child.actionSentence}</div>` : ''}
    </td></tr>`
  }).join('')

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#082465,#1ECFB8);padding:32px 24px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">📊</div>
      <div style="font-size:22px;font-weight:800;color:#fff">Haftalık Öğrenme Özeti</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.7);margin-top:4px">Merhaba ${parentName}!</div>
    </div>
    <div style="padding:24px">
      <p style="color:#64748b;font-size:14px;margin:0 0 20px">Geçen haftaki öğrenme aktiviteleri:</p>
      <table style="width:100%;border-collapse:collapse">${rows}</table>
      <div style="margin-top:24px;text-align:center">
        <a href="https://pratium.com/parent" style="display:inline-block;padding:12px 24px;background:#082465;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px">Detaylı Raporu Gör →</a>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px 24px;text-align:center;font-size:12px;color:#94a3b8">
      Pratium · pratium.com
    </div>
  </div></body></html>`
}

export async function sendResendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: 'Pratium <ozet@pratium.com.tr>', to: [to], subject, html }),
  })
  return res.ok
}

// Bir velinin (parentId) haftalık özetini hesaplar. adminDb service_role
// olmalı (RLS'yi bypass eder, cron/manuel her iki route için de gerekli).
export async function computeParentWeeklySummary(
  adminDb: SupabaseClient,
  parentId: string,
  childIdentityNames: Record<string, string>
): Promise<ChildWeeklySummary[]> {
  const { data: links } = await adminDb
    .from('parent_children')
    .select('child_id, profiles!parent_children_child_id_fkey(grade)')
    .eq('parent_id', parentId)

  if (!links?.length) return []

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const childIds = links.map((l: any) => l.child_id)
  const { data: allSessions } = await adminDb
    .from('quiz_sessions')
    .select('user_id, score, pct, question_count, topic, created_at')
    .in('user_id', childIds)
    .eq('completed', true)
    .gte('created_at', oneWeekAgo.toISOString())
    .order('created_at', { ascending: false })

  const sessionsByChild = new Map<string, QuizSessionRow[]>()
  ;(allSessions ?? []).forEach((s: any) => {
    if (!sessionsByChild.has(s.user_id)) sessionsByChild.set(s.user_id, [])
    sessionsByChild.get(s.user_id)!.push(s)
  })

  const childIdByIndex: string[] = []
  const summaries = links.map((link: any) => {
    const childName = childIdentityNames[link.child_id] || 'Öğrenci'
    const childGrade = link.profiles?.grade ?? null
    childIdByIndex.push(link.child_id)
    return summarizeChildSessions(childName, childGrade, sessionsByChild.get(link.child_id) ?? [])
  })

  // AI-üretimli aksiyon önerisi (Faz 5) — sadece zayıf konusu olan
  // çocuklar için, Faz 1'in mastery skoruna dayanarak. Paralel çalıştırılır
  // (cron'da çok sayıda veli/çocuk olabilir, sıralı AI çağrısı yavaş olurdu).
  await Promise.all(summaries.map(async (s, i) => {
    if (!s.weakestTopic) return
    try {
      const mastery = await getTopicMastery(adminDb, childIdByIndex[i], s.weakestTopic)
      if (mastery && mastery.totalCount >= 2) {
        s.actionSentence = await generateActionSentence(s.name, s.weakestTopic, mastery.masteryScore, mastery.forgettingRisk)
      }
    } catch { /* opsiyonel bağlam, hata olursa sessiz geç */ }
  }))

  // Haftalık Gelişim Oranı — Pazartesi-bazlı bu hafta / geçen hafta
  // karşılaştırması (lib/weekly-growth.ts), veli panelindeki yeni sekmeyle
  // AYNI kaynak. Paralel çalıştırılır.
  await Promise.all(summaries.map(async (s, i) => {
    try {
      s.weeklyGrowth = await computeWeeklyGrowth(adminDb, childIdByIndex[i])
    } catch { /* opsiyonel bağlam, hata olursa sessiz geç */ }
  }))

  return summaries
}
