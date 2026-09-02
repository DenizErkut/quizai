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
import { analyzeStudyDuration } from './study-duration-model'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export interface AutonomousGoal {
  topic: string
  masteryScore: number
  forgettingRisk: string
  reason: string
  actionType?: string
}

// weak_topics'teki TÜM konuları mastery skoruna göre değerlendirip en
// öncelikli (düşük mastery VE/VEYA yüksek unutma riski) hedefleri seçer.
export async function computeAutonomousGoals(
  supabase: SupabaseClient,
  userId: string,
  maxGoals = 4
): Promise<AutonomousGoal[]> {
  // Recommendation Engine v1 is the primary decision source. Environments
  // where migration 017 is not live continue through the weak_topics fallback.
  const { data: recommendations } = await supabase
    .from('student_recommendations')
    .select('topic, action_type, reason, evidence, priority_score')
    .eq('student_id', userId)
    .eq('status', 'active')
    .gt('valid_until', new Date().toISOString())
    .order('priority_score', { ascending: false })
    .limit(maxGoals)

  if (recommendations?.length) {
    return recommendations.map((row: any) => ({
      topic: row.topic,
      masteryScore: Number(row.evidence?.masteryScore ?? row.evidence?.prerequisiteMastery ?? 0),
      forgettingRisk: row.action_type === 'spaced_review' ? 'yüksek' : 'düşük',
      reason: row.reason,
      actionType: row.action_type,
    }))
  }

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

export interface GeneratedPlanResult {
  plan: StudyPlan
  goals: AutonomousGoal[] // bu planın hedefleri -- study_plans.goals_snapshot'a kaydedilip bir sonraki döngüde karşılaştırma için kullanılır
}

export interface GoalEffectiveness {
  topic: string
  masteryBefore: number
  masteryNow: number | null // konu artık weak_topics'te yoksa (hiç yanlış yapılmadıysa) null -- bu da bir tür iyileşme sayılır
  delta: number | null
  status: 'iyileşti' | 'aynı' | 'gerilerdi' | 'veri yok'
}

// Faz 7 (Agentic Education Platform) — "sürekli öğrenme döngüsü"nün
// TEKRAR ÖLÇ + SONUCU DEĞERLENDİR adımı. Önceki bir planın goals_snapshot'ı
// (o an hedeflenen konular + o anki mastery skorları) ile aynı konuların
// ŞU ANKİ mastery skorlarını karşılaştırır. Bu, planın gerçekten işe
// yarayıp yaramadığını ölçen ilk somut adım — önceden hiçbir plan
// üretildikten sonra etkisi hiç kontrol edilmiyordu.
export async function evaluatePreviousGoals(
  supabase: SupabaseClient,
  userId: string,
  previousGoals: AutonomousGoal[]
): Promise<GoalEffectiveness[]> {
  if (!previousGoals?.length) return []

  const { data: rows } = await supabase
    .from('weak_topics')
    .select('topic, wrong_count, total_count, last_seen_at')
    .eq('user_id', userId)
    .in('topic', previousGoals.map(g => g.topic))

  const currentByTopic = new Map<string, TopicMastery>()
  ;(rows ?? []).forEach((r: any) => currentByTopic.set(r.topic, computeTopicMastery(r)))

  return previousGoals.map(g => {
    const current = currentByTopic.get(g.topic)
    if (!current || current.totalCount < 2) {
      return { topic: g.topic, masteryBefore: g.masteryScore, masteryNow: null, delta: null, status: 'veri yok' }
    }
    const delta = current.masteryScore - g.masteryScore
    const status: GoalEffectiveness['status'] = delta >= 10 ? 'iyileşti' : delta <= -10 ? 'gerilerdi' : 'aynı'
    return { topic: g.topic, masteryBefore: g.masteryScore, masteryNow: current.masteryScore, delta, status }
  })
}

export async function generateStudyPlan(
  supabase: SupabaseClient,
  userId: string,
  opts: { grade?: string; language?: string; displayName?: string; previousGoals?: AutonomousGoal[] }
): Promise<GeneratedPlanResult | null> {
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

  // Sürekli öğrenme döngüsü: önceki planın hedefleri varsa, onların ne
  // kadar işe yaradığını (Tekrar Ölç -> Sonucu Değerlendir) yeni planın
  // bağlamına ekle -- AI, geçen haftanın sonucunu bilerek plan yazsın.
  let effectivenessText = ''
  if (opts.previousGoals?.length) {
    const effectiveness = await evaluatePreviousGoals(supabase, userId, opts.previousGoals)
    const lines = effectiveness
      .filter(e => e.status !== 'veri yok')
      .map(e => `- ${e.topic}: ${e.masteryBefore}/100 -> ${e.masteryNow}/100 (${e.status})`)
    if (lines.length) {
      effectivenessText = `\n\nGEÇEN PLANIN SONUCU (bu bilgiyi dikkate al -- iyileşen konulara daha az, gerileyen/aynı kalan konulara daha fazla ağırlık ver):\n${lines.join('\n')}`
    }
  }

  // Faz 11'in 3. tahmin modeli: uygun çalışma süresi. Yeterli veri
  // (en az 5 zamanlı oturum) birikmişse, AI'a günlük süre önerisini
  // (daily_minutes) öğrencinin GERÇEK yorgunluk paternine göre
  // kalibre etmesi için bir ipucu veriliyor. Veri yoksa (yeni özellik,
  // henüz birikmemiş) sessizce atlanır -- bu normal, hata değil.
  let durationText = ''
  try {
    const duration = await analyzeStudyDuration(supabase, userId)
    if (duration.hasEnoughData && duration.fatigueDetected && duration.recommendedSessionLength) {
      durationText = `\n\nÇALIŞMA SÜRESİ İÇGÖRÜSÜ: Bu öğrencinin geçmiş testlerinde, bir oturumda yaklaşık ${duration.fatiguePointEstimate}. sorudan sonra doğruluk oranının belirgin şekilde düştüğü gözlemleniyor (dikkat dağılması paterni). Günlük çalışma önerini (daily_minutes) buna göre, daha KISA ama daha SIK oturumlar önerecek şekilde kalibre et.`
    }
  } catch { /* opsiyonel içgörü, hata olursa sessiz geç */ }

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
${effectivenessText}${durationText}

Kullanicinin kendi notlari (MUTLAKA dikkate al): ${userNotes || 'Not girilmemis'}
Dil: ${opts.language || 'Turkce'}

SADECE JSON don:
{"summary":"2-3 cumle","weeks":[{"week":1,"goal":"hedef","topics":["konu1"],"daily_minutes":20,"focus":"odak"}],"motivation":"motivasyon"}`,
    }],
  }) as any

  try {
    const raw = message.content[0].text.replace(/```json|```/g, '').trim()
    const plan = JSON.parse(raw) as StudyPlan
    return { plan, goals }
  } catch {
    return null
  }
}
