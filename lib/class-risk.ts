// lib/class-risk.ts
// Faz 6 (Teacher Agent) — roadmap karşılaştırma raporunun kalan açık
// maddesi: "risk eşikleme/gruplama mantığı" ve "öğretmen tarafına
// AI-üretimli sınıf analizi/öneri". Faz 1'de kurulan mastery skoru
// (lib/mastery.ts) burada tüm sınıf için toplu kullanılıyor.
//
// Kapsam dışı (roadmap raporunda ayrıca not edildi): kazanım bazlı sınıf
// geneli analiz — bu, MEB kazanım koduna bağlı yapılandırılmış bir
// taksonomi gerektiriyor, ayrı bir içerik projesi (meb-search'e benzer).
import { SupabaseClient } from '@supabase/supabase-js'
import { computeTopicMastery, TopicMastery } from './mastery'

export type StudentRiskLevel = 'riskli' | 'gelistirilmeli' | 'yeterli'

export interface StudentRiskSummary {
  studentId: string
  fullName: string
  riskLevel: StudentRiskLevel
  weakestTopic: string | null
  weakestTopicScore: number | null
}

export interface ClassRiskSummary {
  totalStudents: number
  counts: { riskli: number; gelistirilmeli: number; yeterli: number }
  students: StudentRiskSummary[]
  // En çok öğrencinin riskli/geliştirilmeli olduğu konular — öğretmenin
  // "hangi konuyu tekrar işlemeliyim" sorusuna doğrudan cevap.
  topConcernTopics: { topic: string; studentCount: number }[]
}

// Bir öğrencinin TÜM konulardaki mastery skorlarına bakıp genel risk
// seviyesini belirler. ORTALAMA değil, EN DÜŞÜK skor esas alınır —
// bir öğrencinin tek bir konuda bile ciddi şekilde riskli olması,
// diğer konulardaki iyi performansın arasında kaybolup gizlenmemeli.
function classifyStudentRisk(masteries: TopicMastery[]): { level: StudentRiskLevel; weakest: TopicMastery | null } {
  const withEnoughData = masteries.filter(m => m.totalCount >= 2)
  if (withEnoughData.length === 0) return { level: 'yeterli', weakest: null } // veri yok -> varsayılan olumlu

  const weakest = [...withEnoughData].sort((a, b) => a.masteryScore - b.masteryScore)[0]
  if (weakest.masteryScore < 40) return { level: 'riskli', weakest }
  if (weakest.masteryScore < 65) return { level: 'gelistirilmeli', weakest }
  return { level: 'yeterli', weakest }
}

// Bir grup öğrencinin (ör. bir sınıfın tamamı) risk dağılımını hesaplar.
// Tek sorguda tüm weak_topics'i çeker (N+1 sorgu yerine) — sınıf
// kalabalık olsa bile performanslı kalır.
export async function computeClassRiskSummary(
  supabase: SupabaseClient,
  studentIds: string[],
  studentNames: Record<string, string>
): Promise<ClassRiskSummary> {
  if (!studentIds.length) {
    return { totalStudents: 0, counts: { riskli: 0, gelistirilmeli: 0, yeterli: 0 }, students: [], topConcernTopics: [] }
  }

  const { data: rows } = await supabase
    .from('weak_topics')
    .select('user_id, topic, wrong_count, total_count, last_seen_at')
    .in('user_id', studentIds)

  const byStudent = new Map<string, typeof rows>()
  ;(rows ?? []).forEach((r: any) => {
    if (!byStudent.has(r.user_id)) byStudent.set(r.user_id, [])
    byStudent.get(r.user_id)!.push(r)
  })

  const students: StudentRiskSummary[] = studentIds.map(studentId => {
    const studentRows = byStudent.get(studentId) ?? []
    const masteries = (studentRows as any[]).map(r => computeTopicMastery(r))
    const { level, weakest } = classifyStudentRisk(masteries)
    return {
      studentId,
      fullName: studentNames[studentId] || 'Öğrenci',
      riskLevel: level,
      weakestTopic: weakest?.topic ?? null,
      weakestTopicScore: weakest?.masteryScore ?? null,
    }
  })

  const counts = { riskli: 0, gelistirilmeli: 0, yeterli: 0 }
  students.forEach(s => counts[s.riskLevel]++)

  // En sık görülen "endişe konusu" — riskli/geliştirilmeli öğrencilerin
  // en zayıf konularını say, en çok tekrar edeni öne çıkar.
  const topicCounts = new Map<string, number>()
  students.forEach(s => {
    if (s.riskLevel === 'yeterli' || !s.weakestTopic) return
    topicCounts.set(s.weakestTopic, (topicCounts.get(s.weakestTopic) || 0) + 1)
  })
  const topConcernTopics = [...topicCounts.entries()]
    .map(([topic, studentCount]) => ({ topic, studentCount }))
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 5)

  return { totalStudents: studentIds.length, counts, students, topConcernTopics }
}
