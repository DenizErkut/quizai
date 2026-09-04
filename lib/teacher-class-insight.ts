// lib/teacher-class-insight.ts
// Faz 6 (Teacher Agent) — sınıf risk dağılımına bakıp öğretmene kısa,
// somut bir aksiyon önerisi üretir. app/api/teacher/analyze (mevcut,
// tek-öğrenci-tek-ödev analizi) ile KARIŞTIRILMAMALI — bu, tüm sınıfın
// genel durumuna bakan, ayrı bir öneri katmanı.
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { ClassRiskSummary } from './class-risk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function defaultInsight(summary: ClassRiskSummary): string {
  if (summary.counts.riskli === 0) {
    return 'Sınıfın genelinde ciddi bir risk görünmüyor — mevcut tempoyu sürdürebilirsiniz.'
  }
  const topTopic = summary.topConcernTopics[0]
  return topTopic
    ? `${summary.counts.riskli} öğrenci risk altında görünüyor, özellikle "${topTopic.topic}" konusunda (${topTopic.studentCount} öğrenci). Bu konuyu sınıfta tekrar işlemeyi değerlendirebilirsiniz.`
    : `${summary.counts.riskli} öğrenci risk altında görünüyor — bireysel destek planlamayı değerlendirebilirsiniz.`
}

// Sınıfın risk dağılımına (Faz 1'in mastery skoruna dayanan) bakıp
// öğretmene 2-3 cümlelik, somut ve aksiyona dönük bir öneri üretir.
// AI çağrısı başarısız olursa şablonlu (ama yine bilgilendirici) bir
// cümleye düşer — öğretmen ekranı asla boş kalmaz.
export async function generateClassInsight(
  className: string,
  summary: ClassRiskSummary
): Promise<string> {
  if (summary.totalStudents === 0) return 'Bu sınıfta henüz yeterli veri yok.'

  try {
    const topicsText = summary.topConcernTopics.length
      ? summary.topConcernTopics.map(t => `- ${t.topic}: ${t.studentCount} öğrenci`).join('\n')
      : 'Belirgin bir ortak zayıf konu yok.'

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: `Bir öğretmenin "${className}" sınıfının risk dağılımı:
- Toplam öğrenci: ${summary.totalStudents}
- 🔴 Riskli: ${summary.counts.riskli}
- 🟡 Geliştirilmeli: ${summary.counts.gelistirilmeli}
- 🟢 Yeterli: ${summary.counts.yeterli}

En çok öğrencinin zorlandığı konular:
${topicsText}

Öğretmene bu veriye dayanarak 2-3 cümlelik, somut ve aksiyona dönük bir öneri yaz (ör. hangi konuyu tekrar işlemeli, hangi öğrenci grubuna bireysel destek gerekebilir). Sadece öneriyi yaz, başlık veya açıklama ekleme.`,
      }],
    }) as any
    logAnthropicUsage('teacher-class-insight', 'claude-haiku-4-5-20251001', msg)
    const text = msg.content?.[0]?.text?.trim()
    return text || defaultInsight(summary)
  } catch {
    return defaultInsight(summary)
  }
}
