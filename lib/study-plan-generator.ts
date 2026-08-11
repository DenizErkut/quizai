// lib/study-plan-generator.ts
// Faz 4 (Student Agent) — roadmap karşılaştırma raporunun kalan açık
// maddeleri: "otonom hedef belirleme mantığı" ve "kendiliğinden güncellenen
// plan". Önceki halde `study-plan` route'u client'ın gönderdiği ham
// weakTopics listesine (basit wrong_count sıralaması) göre AI'a serbestçe
// plan yazdırıyordu — hedef seçimi sistem tarafından değil, dolaylı olarak
// AI'ın kendi takdirine bırakılıyordu. Bu modül hedefleri DETERMİNİSTİK
// olarak (Faz 1'in mastery skoruna göre) sistem tarafından seçer, AI'a
// sadece bu hedefler etrafında bir anlatı/haftalık program yazdırır.
import { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { computeTopicMastery, TopicMastery } from './mastery'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export interface AutonomousGoal {
  topic: string
  masteryScore: number
  forgettingRisk: string
  reason: string
}

// weak_topics'teki TÜM konuları mastery skoruna göre değerlendirip en
// öncelikli (düşük mastery VE/VEYA yüksek unutma riski) hedefleri seçer.
export async function computeAutonomousGoals(
  supabase: SupabaseClient,
  userId: string,
  maxGoals = 4
): Promise<AutonomousGoal[]> {
  const { data: rows } = await supabase
    .from('weak_topics')
    .select('topic, wrong_count, total_count, last_seen_at')
    .eq('user_id', userId)

  if (!rows?.length) return []

  const scored = rows
    .map((r: any) => computeTopicMastery(r))
    .filter((m: TopicMastery) => m.totalCount >= 2) // çok az veriyle hedef belirlemek gürültülü olur
    .map((m: TopicMastery) => {
      const riskBonus = m.forgettingRisk === 'yüksek' ? 30 : m.forgettingRisk === 'orta' ? 15 : 0
      const priority = (100 - m.masteryScore) + riskBonus
      const reason = m.masteryScore < 50
        ? `Bu konuda mastery skorun düşük (${m.masteryScore}/100)`
        : `Bu konuyu bir süredir tekrar etmedin, unutma riski var`
      return { topic: m.topic, masteryScore: m.masteryScore, forgettingRisk: m.forgettingRisk, reason, priority: priority as number }
    })
    .sort((a: any, b: any) => b.priority - a.priority)
    .slice(0, maxGoals)

  return scored.map(({ priority, ...rest }: any) => rest)
}

export interface PlanWeek {
  week: number
  goal: string
  topics: string[]
  daily_minutes: number
  focus: string
}

export interface StudyPlan {
  summary: string
  weeks: PlanWeek[]
  motivation: string
}

export async function generateStudyPlan(
  supabase: SupabaseClient,
  userId: string,
  opts: { grade?: string; language?: string; displayName?: string }
): Promise<StudyPlan | null> {
  const goals = await computeAutonomousGoals(supabase, userId)

  const { data: notesData } = await supabase
    .from('user_notes').select('content').eq('user_id', userId)
    .order('updated_at', { ascending: false }).limit(5)
  const userNotes = notesData?.map((n: any) => n.content).join('\n---\n') || ''

  const { data: sessions } = await supabase
    .from('quiz_sessions').select('pct').eq('user_id', userId).eq('completed', true)
  const avgPct = sessions?.length
    ? Math.round(sessions.reduce((s: number, x: any) => s + x.pct, 0) / sessions.length)
    : 0

  const goalsText = goals.length > 0
    ? goals.map(g => `- ${g.topic} (mastery: ${g.masteryScore}/100, ${g.reason})`).join('\n')
    : 'Henüz yeterli veri yok — genel bir başlangıç planı hazırla.'

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Sen bir egitim kocusun. ${opts.displayName || 'Öğrenci'} icin 4 haftalik kisisel calisma plani olustur.
Profil: ${opts.grade || ''}
Ortalama basari: %${avgPct}
Toplam test: ${sessions?.length || 0}

SISTEM TARAFINDAN BELIRLENEN ONCELIKLI KONULAR (bunlari plana MUTLAKA dahil et, mastery skoru dusuk olan konulara daha fazla hafta ayir):
${goalsText}

Kullanicinin kendi notlari (MUTLAKA dikkate al): ${userNotes || 'Not girilmemis'}
Dil: ${opts.language || 'Turkce'}

SADECE JSON don:
{"summary":"2-3 cumle","weeks":[{"week":1,"goal":"hedef","topics":["konu1"],"daily_minutes":20,"focus":"odak"}],"motivation":"motivasyon"}`,
    }],
  }) as any

  try {
    const raw = message.content[0].text.replace(/```json|```/g, '').trim()
    return JSON.parse(raw)
  } catch {
    return null
  }
}
