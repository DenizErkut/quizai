// lib/study-duration-model.ts
// Faz 11'in 3. ve son tahmin modeli: "uygun çalışma süresi tahmini".
// Önceki iki modelden (predictive-risk: performans trendi,
// disengagement-risk: aktivite sıklığı) farklı olarak bu, TEK bir
// oturum İÇİNDEKİ yorgunluk paternine bakıyor — "bu öğrenci kaçıncı
// sorudan sonra performansı düşmeye başlıyor?".
//
// ÖNEMLİ: Bu modelin ihtiyaç duyduğu soru-başına-süre verisi (answers[i]
// .timeMs) YENİ eklendi (app/quiz/page.tsx) — geçmiş oturumlarda bu veri
// YOK. Bu yüzden model, deploy sonrası öğrenciler yeni testler çözdükçe
// veri birikmeye başlayana kadar "hasEnoughData: false" dönecek. Bu
// beklenen bir durum, bir hata değil.
import { SupabaseClient } from '@supabase/supabase-js'

export interface StudyDurationInsight {
  hasEnoughData: boolean
  sessionsAnalyzed: number
  avgTimePerQuestionSec: number | null
  fatigueDetected: boolean
  fatiguePointEstimate: number | null // yaklaşık kaçıncı sorudan sonra doğruluk belirgin düşüyor (1-indexed)
  recommendedSessionLength: number | null // önerilen soru sayısı
}

const MIN_SESSIONS_WITH_TIMING = 5
const MIN_QUESTIONS_PER_SESSION = 5
const FATIGUE_DROP_THRESHOLD = 0.15 // %15+ doğruluk düşüşü "yorgunluk" sayılır

const EMPTY_RESULT: StudyDurationInsight = {
  hasEnoughData: false, sessionsAnalyzed: 0, avgTimePerQuestionSec: null,
  fatigueDetected: false, fatiguePointEstimate: null, recommendedSessionLength: null,
}

export async function analyzeStudyDuration(
  supabase: SupabaseClient,
  studentId: string
): Promise<StudyDurationInsight> {
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('answers')
    .eq('user_id', studentId)
    .eq('completed', true)
    .order('created_at', { ascending: false })
    .limit(30)

  // Sadece timeMs verisi İÇEREN (yeni özellik sonrası çözülmüş) VE
  // yeterli soru sayısına sahip oturumlar sayılır.
  const validSessions = (sessions || []).filter((s: any) => {
    const a = s.answers
    return Array.isArray(a) && a.length >= MIN_QUESTIONS_PER_SESSION &&
      a.every((x: any) => typeof x.timeMs === 'number' && x.timeMs >= 0)
  })

  if (validSessions.length < MIN_SESSIONS_WITH_TIMING) {
    return { ...EMPTY_RESULT, sessionsAnalyzed: validSessions.length }
  }

  // Soru pozisyonuna göre (0-indexed) toplu doğruluk ve süre istatistiği
  const positionStats: Record<number, { correct: number; total: number }> = {}
  for (const s of validSessions) {
    ;(s.answers as any[]).forEach((a, i) => {
      if (!positionStats[i]) positionStats[i] = { correct: 0, total: 0 }
      positionStats[i].total++
      if (a.correct) positionStats[i].correct++
    })
  }

  const positions = Object.keys(positionStats).map(Number).sort((a, b) => a - b)
  if (positions.length < 3) {
    return { ...EMPTY_RESULT, sessionsAnalyzed: validSessions.length }
  }

  const accByPos = positions.map(p => ({ pos: p, acc: positionStats[p].correct / positionStats[p].total }))
  const mid = Math.floor(positions.length / 2)
  const firstHalfAcc = accByPos.slice(0, mid).reduce((s, x) => s + x.acc, 0) / mid
  const secondHalfAcc = accByPos.slice(mid).reduce((s, x) => s + x.acc, 0) / (accByPos.length - mid)

  const fatigueDetected = (firstHalfAcc - secondHalfAcc) >= FATIGUE_DROP_THRESHOLD

  let fatiguePointEstimate: number | null = null
  if (fatigueDetected) {
    const baseline = accByPos[0].acc
    for (let i = 1; i < accByPos.length; i++) {
      if (baseline - accByPos[i].acc >= FATIGUE_DROP_THRESHOLD) {
        fatiguePointEstimate = accByPos[i].pos + 1 // insan-okunur (1-indexed)
        break
      }
    }
  }

  const totalTimeMs = validSessions.reduce(
    (sum: number, s: any) => sum + s.answers.reduce((a: number, x: any) => a + (x.timeMs || 0), 0), 0
  )
  const totalQuestions = validSessions.reduce((sum: number, s: any) => sum + s.answers.length, 0)
  const avgTimePerQuestionSec = totalQuestions > 0 ? Math.round(totalTimeMs / totalQuestions / 1000) : null

  return {
    hasEnoughData: true,
    sessionsAnalyzed: validSessions.length,
    avgTimePerQuestionSec,
    fatigueDetected,
    fatiguePointEstimate,
    recommendedSessionLength: fatiguePointEstimate ? Math.max(3, fatiguePointEstimate - 1) : null,
  }
}
