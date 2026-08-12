// lib/weekly-growth.ts
// "Haftalık Gelişim Oranı" — bu haftanın (Pazartesi'den bugüne) ortalama
// başarısını, GEÇEN haftanın (Pazartesi-Pazar) ortalamasıyla karşılaştırır.
// Hem veli panelinin yeni sekmesi hem haftalık özet e-postası (Faz 5)
// tarafından kullanılan TEK, paylaşılan kaynak.
import { SupabaseClient } from '@supabase/supabase-js'

export interface WeeklyGrowth {
  thisWeekAvg: number | null
  lastWeekAvg: number | null
  thisWeekCount: number
  lastWeekCount: number
  deltaPoints: number | null // yüzde puan farkı (thisWeekAvg - lastWeekAvg)
}

// Haftanın ilk günü Pazartesi kabul edilir (TR standardı). offsetWeeks=0
// bu haftayı, -1 geçen haftayı verir.
function getWeekBoundaries(offsetWeeks: number): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay() // 0=Pazar, 1=Pazartesi, ...
  const diffToMonday = day === 0 ? -6 : 1 - day
  const thisMonday = new Date(now)
  thisMonday.setHours(0, 0, 0, 0)
  thisMonday.setDate(now.getDate() + diffToMonday)

  const start = new Date(thisMonday)
  start.setDate(thisMonday.getDate() + offsetWeeks * 7)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { start, end }
}

export async function computeWeeklyGrowth(
  supabase: SupabaseClient,
  studentId: string
): Promise<WeeklyGrowth> {
  const thisWeek = getWeekBoundaries(0)
  const lastWeek = getWeekBoundaries(-1)

  // Tek sorguda iki haftayı da çek (geçen haftanın başından bu haftanın
  // sonuna kadar), sonra bellekte ikiye ayır -- iki ayrı sorgu yerine.
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('pct, created_at')
    .eq('user_id', studentId)
    .eq('completed', true)
    .gte('created_at', lastWeek.start.toISOString())
    .lt('created_at', thisWeek.end.toISOString())

  const rows = sessions ?? []
  const thisWeekSessions = rows.filter((s: any) => {
    const t = new Date(s.created_at).getTime()
    return t >= thisWeek.start.getTime() && t < thisWeek.end.getTime()
  })
  const lastWeekSessions = rows.filter((s: any) => {
    const t = new Date(s.created_at).getTime()
    return t >= lastWeek.start.getTime() && t < lastWeek.end.getTime()
  })

  const avg = (arr: any[]): number | null =>
    arr.length ? Math.round(arr.reduce((a, x) => a + (x.pct || 0), 0) / arr.length) : null

  const thisWeekAvg = avg(thisWeekSessions)
  const lastWeekAvg = avg(lastWeekSessions)

  return {
    thisWeekAvg,
    lastWeekAvg,
    thisWeekCount: thisWeekSessions.length,
    lastWeekCount: lastWeekSessions.length,
    deltaPoints: thisWeekAvg != null && lastWeekAvg != null ? thisWeekAvg - lastWeekAvg : null,
  }
}
