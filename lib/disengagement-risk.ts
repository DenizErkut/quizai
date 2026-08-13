// lib/disengagement-risk.ts
// Faz 11 (Öngörücü Öğrenme) roadmap'inde önerilen ama kurulmamış olan
// ikinci tahmin modeli: "öğrenci disengagement riski". Mevcut
// predictive-risk.ts SADECE performansa (skor düşüyor mu) bakıyor —
// bu modül farklı bir sinyale bakıyor: öğrenci hâlâ iyi puanlar alıyor
// olsa bile, ne sıklıkla pratik yaptığı düşüyorsa bu erken bir
// "bırakma" (churn) belirtisidir. Skordan tamamen bağımsız.
import { SupabaseClient } from '@supabase/supabase-js'

export interface DisengagementSignal {
  isDisengaging: boolean
  daysSinceLastActivity: number
  recentWeeklyAvg: number  // son 14 gündeki haftalık ortalama test sayısı
  priorWeeklyAvg: number   // ondan önceki 14 gündeki haftalık ortalama
}

export async function checkDisengagement(
  supabase: SupabaseClient,
  studentId: string
): Promise<DisengagementSignal> {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('created_at')
    .eq('user_id', studentId)
    .eq('completed', true)
    .gte('created_at', since)
    .order('created_at', { ascending: true })

  if (!sessions || sessions.length === 0) {
    return { isDisengaging: false, daysSinceLastActivity: 999, recentWeeklyAvg: 0, priorWeeklyAvg: 0 }
  }

  const now = Date.now()
  const lastTime = new Date(sessions[sessions.length - 1].created_at).getTime()
  const daysSinceLastActivity = Math.floor((now - lastTime) / (24 * 60 * 60 * 1000))

  const midpoint = now - 14 * 24 * 60 * 60 * 1000
  const recentCount = sessions.filter((s: any) => new Date(s.created_at).getTime() >= midpoint).length
  const priorCount = sessions.filter((s: any) => new Date(s.created_at).getTime() < midpoint).length

  const recentWeeklyAvg = Math.round((recentCount / 2) * 10) / 10
  const priorWeeklyAvg = Math.round((priorCount / 2) * 10) / 10

  // Sadece geçmişte GERÇEKTEN aktifken (önceki 2 haftada haftada ~1+
  // test) şimdi belirgin bir düşüş varsa "disengaging" say — hiç aktif
  // olmamış bir öğrenci için "düşüş" anlamsız bir sinyal olur, yanlış
  // alarm üretir.
  let isDisengaging = false
  if (priorWeeklyAvg >= 1) {
    const dropRatio = (priorWeeklyAvg - recentWeeklyAvg) / priorWeeklyAvg
    if (dropRatio >= 0.5 || daysSinceLastActivity >= 10) isDisengaging = true
  }

  return { isDisengaging, daysSinceLastActivity, recentWeeklyAvg, priorWeeklyAvg }
}
