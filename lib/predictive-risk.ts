// lib/predictive-risk.ts
// Faz 11 (Predictive Learning) — roadmap karşılaştırma raporunda "Faz 1
// tamamlanmadan teknik olarak imkansız" diye not edilmişti; Faz 1 artık
// tamamlandığı için bu faz açıldı.
//
// Faz 1'in mastery.ts'i "şu anki durum ne" sorusuna cevap veriyor (anlık
// görüntü). Bu dosya farklı bir soruya cevap arıyor: "yön ne tarafa
// gidiyor" — roadmap'in kendi örneği: "Son 10 test → Başarı düşüyor →
// ... → SYSTEM ALERT". Bu, gerçek bir ÖNGÖRÜ sinyali — öğrenci henüz
// "riskli" eşiğe düşmemiş olsa bile, gidişat kötüyse erken uyarabiliyor.
import { SupabaseClient } from '@supabase/supabase-js'

export interface TrendAnalysis {
  topic: string
  sessionCount: number
  pctSequence: number[] // eskiden yeniye sıralı test yüzdeleri
  slope: number // basit lineer regresyon eğimi (test başına ~%puan değişimi)
  trend: 'düşüyor' | 'sabit' | 'yükseliyor'
  decliningTowardRisk: boolean // eğilim düşüyor VE son skor riskli bölgeye yaklaşıyor
}

// x = 0,1,2... (test sırası), y = yüzde. Basit en küçük kareler eğimi.
function linearSlope(values: number[]): number {
  const n = values.length
  const xMean = (n - 1) / 2
  const yMean = values.reduce((a, b) => a + b, 0) / n
  let num = 0, den = 0
  values.forEach((y, x) => { num += (x - xMean) * (y - yMean); den += (x - xMean) ** 2 })
  return den === 0 ? 0 : num / den
}

// Bir konudaki SON birkaç test sonucuna bakıp performansın DÜŞME
// EĞİLİMİNDE olup olmadığını tespit eder. minSessions altında veri varsa
// (güvenilir bir eğim çıkarmak için yetersiz) null döner — az veriyle
// yanlış alarm vermemek için bilinçli bir eşik.
export async function analyzeTrend(
  supabase: SupabaseClient,
  userId: string,
  topic: string,
  minSessions = 4,
  lookback = 10
): Promise<TrendAnalysis | null> {
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('pct, created_at')
    .eq('user_id', userId)
    .eq('completed', true)
    .ilike('topic', topic)
    .order('created_at', { ascending: false })
    .limit(lookback)

  if (!sessions || sessions.length < minSessions) return null

  const pctSequence = [...sessions].reverse().map((s: any) => s.pct) // eskiden yeniye
  const slope = linearSlope(pctSequence)
  const trend: TrendAnalysis['trend'] = slope < -3 ? 'düşüyor' : slope > 3 ? 'yükseliyor' : 'sabit'
  const lastPct = pctSequence[pctSequence.length - 1]
  const decliningTowardRisk = trend === 'düşüyor' && lastPct < 65

  return {
    topic,
    sessionCount: pctSequence.length,
    pctSequence,
    slope: Math.round(slope * 10) / 10,
    trend,
    decliningTowardRisk,
  }
}
