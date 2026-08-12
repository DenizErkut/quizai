// lib/learning-graph.ts
// Faz 10 (Learning Graph) — roadmap karşılaştırma raporunun istediği
// dönüşüm: "Bu soruyu yanlış yaptı" demekten çıkıp "Bu öğrencinin bu
// kazanımı öğrenebilmesi için önce şu ön koşul kazanımını güçlendirmesi
// gerekiyor" diyebilmek.
//
// ÖNEMLİ KAPSAM NOTU: Bu, TÜM MEB müfredatını kapsayan bir taksonomi
// DEĞİL — böyle bir taksonomi gerçek eğitim uzmanlığı gerektiren, ayrı
// ve çok daha büyük bir içerik projesi (meb-search'ün kurulumuna benzer
// ölçekte). Burada sadece roadmap dokümanının kendi örnek diyagramındaki
// (Kesirler/Ondalık Sayılar) ilişkiler, PROOF-OF-CONCEPT olarak
// `topic_prerequisites` tablosuna girildi. Bu konular dışında bir konu
// için hiçbir ön koşul bulunamayacak (bu beklenen bir durum, hata değil).
import { SupabaseClient } from '@supabase/supabase-js'
import { computeTopicMastery, TopicMastery } from './mastery'

export interface PrerequisiteGap {
  topic: string
  prerequisiteTopic: string
  prerequisiteMastery: TopicMastery | null // null: öğrenci bu ön koşulu hiç denememiş
}

// Bir konudaki performansa bakmadan önce, o konunun KAYITLI ön koşullarında
// (topic_prerequisites) da öğrencinin zayıf olup olmadığını kontrol eder.
export async function findPrerequisiteGaps(
  supabase: SupabaseClient,
  userId: string,
  topic: string
): Promise<PrerequisiteGap[]> {
  const { data: prereqRows } = await supabase
    .from('topic_prerequisites')
    .select('prerequisite_topic')
    .ilike('topic', topic)

  if (!prereqRows?.length) return []

  const prereqTopics = [...new Set(prereqRows.map((r: any) => r.prerequisite_topic))] as string[]
  const { data: masteryRows } = await supabase
    .from('weak_topics')
    .select('topic, wrong_count, total_count, last_seen_at')
    .eq('user_id', userId)
    .in('topic', prereqTopics)

  const masteryByTopic = new Map<string, TopicMastery>()
  ;(masteryRows ?? []).forEach((r: any) => masteryByTopic.set(r.topic, computeTopicMastery(r)))

  return prereqTopics
    .map((pt: string) => ({ topic, prerequisiteTopic: pt, prerequisiteMastery: masteryByTopic.get(pt) || null }))
    // Ön koşulda hiç veri yoksa (öğrenci hiç denememiş) ya da mastery
    // düşükse (<60) bunu bir "boşluk" olarak işaretle.
    .filter((g: PrerequisiteGap) => !g.prerequisiteMastery || g.prerequisiteMastery.masteryScore < 60)
}

// generate-quiz / chat gibi tüketicilerin AI prompt'una eklemesi için
// hazır, doğal dilde bir bağlam metni üretir.
export function buildPrerequisiteContext(gaps: PrerequisiteGap[]): string {
  if (!gaps.length) return ''
  const lines = gaps.map(g => {
    if (!g.prerequisiteMastery) return `- "${g.prerequisiteTopic}" (bu ön koşul konuda hiç veri yok, öğrenci hiç denememiş olabilir)`
    return `- "${g.prerequisiteTopic}" (mastery: ${g.prerequisiteMastery.masteryScore}/100)`
  })
  return `\n\nÖN KOŞUL UYARISI: Bu öğrencinin "${gaps[0].topic}" konusunu tam öğrenebilmesi için önce şu ön koşul konu(lar)da da zayıf olabileceği tespit edildi:\n${lines.join('\n')}\nMümkünse bu ön koşul kavram(lar)a kısaca değinerek başla, doğrudan asıl konuya atlamadan önce temeli sağlamlaştır.`
}
