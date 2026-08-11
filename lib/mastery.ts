// lib/mastery.ts
// Faz 1 (Learning Intelligence Layer) — roadmap karşılaştırma raporunun kalan
// açık maddeleri için: basit wrong/total oranını gerçek bir mastery skoruna
// genişletir (güven aralığı + zaman ağırlıklı unutma riski), ve soru-tipi
// bazlı hata paterni tespiti ekler (weak_topics'in tutmadığı, ama
// quiz_sessions.questions/answers JSONB'sinde zaten var olan bir detay).
//
// Kapsam dışı bırakılan (roadmap raporunda ayrıca not edildi): MEB kazanım
// koduna bağlı yapılandırılmış takip — bu, meb-search kurulumuna benzer
// ayrı bir içerik/taksonomi projesi, tek oturumda kod ile çözülecek bir şey
// değil.
import { SupabaseClient } from '@supabase/supabase-js'

export type Confidence = 'düşük' | 'orta' | 'yüksek'
export type Risk = 'düşük' | 'orta' | 'yüksek'

export interface TopicMastery {
  topic: string
  masteryScore: number // 0-100, yüksek = iyi biliniyor
  confidence: Confidence // kaç denemeye dayandığı
  forgettingRisk: Risk // last_seen_at'tan bu yana geçen süreye göre
  daysSinceLastSeen: number | null
  wrongCount: number
  totalCount: number
}

// Basit wrong/total oranı, az denemede (ör. 1 yanlış / 1 toplam = %0 mastery)
// aşırı iddialı ve yanıltıcı olur. Bayesian smoothing ile "sanal" birkaç
// nötr deneme eklenmiş gibi davranarak, az veri varken skoru 50'ye (nötr)
// doğru çeker — deneme sayısı arttıkça gerçek orana yaklaşır.
const PRIOR_ATTEMPTS = 3
const PRIOR_CORRECT_RATE = 0.6 // nötr varsayım: ne çok iyi ne çok kötü

export function computeTopicMastery(row: {
  topic: string
  wrong_count: number
  total_count: number
  last_seen_at: string | null
}): TopicMastery {
  const total = row.total_count || 0
  const wrong = row.wrong_count || 0
  const correct = Math.max(0, total - wrong)

  const smoothedScore = Math.round(
    ((correct + PRIOR_ATTEMPTS * PRIOR_CORRECT_RATE) / (total + PRIOR_ATTEMPTS)) * 100
  )

  const confidence: Confidence = total < 3 ? 'düşük' : total < 8 ? 'orta' : 'yüksek'

  const daysSince = row.last_seen_at
    ? Math.floor((Date.now() - new Date(row.last_seen_at).getTime()) / 86_400_000)
    : null

  // Basitleştirilmiş unutma eğrisi: iyi bilinen konular daha yavaş unutulur
  // varsayımıyla, mastery skoruna göre farklı bozulma eşikleri kullanılır.
  let forgettingRisk: Risk = 'düşük'
  if (daysSince !== null) {
    const decayThresholdDays = smoothedScore >= 80 ? 30 : smoothedScore >= 50 ? 14 : 7
    if (daysSince > decayThresholdDays * 2) forgettingRisk = 'yüksek'
    else if (daysSince > decayThresholdDays) forgettingRisk = 'orta'
  }

  return {
    topic: row.topic,
    masteryScore: smoothedScore,
    confidence,
    forgettingRisk,
    daysSinceLastSeen: daysSince,
    wrongCount: wrong,
    totalCount: total,
  }
}

export async function getTopicMastery(
  supabase: SupabaseClient,
  userId: string,
  topic: string
): Promise<TopicMastery | null> {
  const { data } = await supabase
    .from('weak_topics')
    .select('topic, wrong_count, total_count, last_seen_at')
    .eq('user_id', userId)
    .ilike('topic', topic)
    .maybeSingle()
  if (!data) return null
  return computeTopicMastery(data as any)
}

export interface ErrorPatterns {
  sampleSize: number
  skipRate: number // 0-1, cevapsız bırakılan soru oranı (userAns === -1)
  weakestType: { type: string; wrongRate: number; sampleSize: number } | null
}

// Bir konudaki SON N oturumdaki soru/cevap detayına bakarak (quiz_sessions.
// questions + answers JSONB'leri) soru TİPİ bazlı hata paternini ve atlama
// (cevapsız bırakma) oranını çıkarır. weak_topics'in tutmadığı bir ayrıntı
// seviyesi — "bu öğrenci boşluk doldurmada mı, eşleştirmede mi zorlanıyor"
// gibi bir sinyal, sadece toplam yanlış/doğru oranından çıkarılamaz.
export async function computeErrorPatterns(
  supabase: SupabaseClient,
  userId: string,
  topic: string,
  sessionLimit = 20
): Promise<ErrorPatterns> {
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('questions, answers')
    .eq('user_id', userId)
    .eq('completed', true)
    .ilike('topic', topic)
    .order('created_at', { ascending: false })
    .limit(sessionLimit)

  const typeStats: Record<string, { wrong: number; total: number }> = {}
  let skipped = 0
  let totalAnswers = 0

  for (const session of sessions ?? []) {
    const questions = (session as any).questions as any[] | null
    const answers = (session as any).answers as any[] | null
    if (!Array.isArray(questions) || !Array.isArray(answers)) continue

    for (let i = 0; i < answers.length; i++) {
      const a = answers[i]
      const q = questions[i]
      if (!a || !q) continue
      totalAnswers++
      if (a.userAns === -1) { skipped++; continue }

      const type = q.type || 'unknown'
      if (!typeStats[type]) typeStats[type] = { wrong: 0, total: 0 }
      typeStats[type].total++
      if (!a.correct) typeStats[type].wrong++
    }
  }

  let weakestType: ErrorPatterns['weakestType'] = null
  for (const [type, s] of Object.entries(typeStats)) {
    // Anlamlı bir sinyal için en az 3 örnek gerekiyor (aksi halde tek bir
    // yanlış cevap "bu tipte hep zorlanıyor" gibi yanlış yorumlanabilir)
    if (s.total < 3) continue
    const wrongRate = s.wrong / s.total
    if (wrongRate >= 0.5 && (!weakestType || wrongRate > weakestType.wrongRate)) {
      weakestType = { type, wrongRate: Math.round(wrongRate * 100) / 100, sampleSize: s.total }
    }
  }

  return {
    sampleSize: totalAnswers,
    skipRate: totalAnswers > 0 ? Math.round((skipped / totalAnswers) * 100) / 100 : 0,
    weakestType,
  }
}

// generate-quiz prompt'una eklenecek, öğrenci geçmişine dayalı bağlam
// metnini üretir. Mastery + hata paterni tek bir yerden birleştirilir.
// Anlamlı bir sinyal yoksa (yeterli veri yoksa) boş string döner.
const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'çoktan seçmeli',
  fill_blank: 'boşluk doldurma',
  true_false: 'doğru/yanlış',
  multi_true_false: 'çoklu doğru/yanlış',
  matching: 'eşleştirme',
  table_fill: 'tablo doldurma',
  short_answer: 'kısa cevap',
}

export function buildStudentHistoryContext(mastery: TopicMastery | null, patterns: ErrorPatterns | null): string {
  if (!mastery || mastery.totalCount < 3) return ''

  const parts: string[] = []
  parts.push(
    `This student's mastery on "${mastery.topic}" is estimated at ${mastery.masteryScore}/100 ` +
    `(confidence: ${mastery.confidence}, based on ${mastery.totalCount} past questions, ${mastery.wrongCount} wrong).`
  )

  if (mastery.masteryScore < 60) {
    parts.push('Emphasize fundamentals, use a gentler difficulty progression, and make explanations extra clear and step-by-step.')
  }

  if (mastery.forgettingRisk === 'yüksek') {
    parts.push(
      `It has been ${mastery.daysSinceLastSeen} days since this student last practiced this topic — forgetting risk is high. ` +
      `Include 1-2 review questions on core fundamentals before moving to harder material.`
    )
  } else if (mastery.forgettingRisk === 'orta') {
    parts.push(`It has been ${mastery.daysSinceLastSeen} days since last practice — include a brief fundamentals refresher.`)
  }

  if (patterns?.weakestType) {
    const label = QUESTION_TYPE_LABELS[patterns.weakestType.type] || patterns.weakestType.type
    parts.push(
      `This student specifically struggles with "${label}"-type questions on this topic ` +
      `(${Math.round(patterns.weakestType.wrongRate * 100)}% wrong on ${patterns.weakestType.sampleSize} recent questions of this type). ` +
      `Give extra scaffolding/clarity for this question type, or slightly reduce its proportion this time.`
    )
  }

  if (patterns && patterns.sampleSize >= 5 && patterns.skipRate >= 0.3) {
    parts.push(
      `This student frequently leaves questions on this topic unanswered (${Math.round(patterns.skipRate * 100)}% skip rate) — ` +
      `this may indicate confusion or time pressure rather than a specific wrong-answer pattern. Make questions clearer and more approachable.`
    )
  }

  return '\n\nSTUDENT HISTORY: ' + parts.join(' ')
}
