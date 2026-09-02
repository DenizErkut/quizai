// lib/learning-graph.ts
// Learning Graph v1: onaylı ön koşul ilişkilerini typed node/edge grafından
// okuyup öğrencinin event-tabanlı mastery durumuyla birleştirir. Şema bütün
// aktif müfredat konularını düğüm olarak taşır; ilişkiler ise eğitim uzmanı /
// admin onayı olmadan yayımlanmaz.
import { SupabaseClient } from '@supabase/supabase-js'
import { getTopicMastery, TopicMastery } from './mastery'

export interface PrerequisiteGap {
  topic: string
  prerequisiteTopic: string
  prerequisiteMastery: TopicMastery | null // null: öğrenci bu ön koşulu hiç denememiş
}

interface GraphNodeId { id: string }
interface GraphEdgeSource { source_node_id: string }
interface GraphNodeLabel { label: string }
interface LegacyPrerequisite { prerequisite_topic: string }

// Bir konudaki performansa bakmadan önce, o konunun doğrulanmış ön
// koşullarında öğrencinin zayıf olup olmadığını kontrol eder.
export async function findPrerequisiteGaps(
  supabase: SupabaseClient,
  userId: string,
  topic: string,
  subject?: string
): Promise<PrerequisiteGap[]> {
  let nodeQuery = supabase.from('learning_graph_nodes')
    .select('id').eq('node_type', 'topic').ilike('label', topic).eq('is_active', true)
  if (subject) nodeQuery = nodeQuery.ilike('subject', subject)
  const { data: targetNodes } = await nodeQuery

  let prereqTopics: string[] = []
  if (targetNodes?.length) {
    const { data: edges } = await supabase.from('learning_graph_edges')
      .select('source_node_id').eq('edge_type', 'prerequisite_of').eq('is_verified', true)
      .in('target_node_id', (targetNodes as GraphNodeId[]).map(n => n.id))
    if (edges?.length) {
      const { data: nodes } = await supabase.from('learning_graph_nodes')
        .select('label').in('id', (edges as GraphEdgeSource[]).map(e => e.source_node_id)).eq('is_active', true)
      prereqTopics = [...new Set(((nodes ?? []) as GraphNodeLabel[]).map(n => n.label))]
    }
  }

  // Migration henüz ulaşmamış ortamlarda eski davranışı koru.
  if (!prereqTopics.length) {
    let legacyQuery = supabase.from('topic_prerequisites')
      .select('prerequisite_topic').ilike('topic', topic)
    if (subject) legacyQuery = legacyQuery.ilike('subject', subject)
    const { data: legacyRows } = await legacyQuery
    prereqTopics = [...new Set(((legacyRows ?? []) as LegacyPrerequisite[]).map(r => r.prerequisite_topic))]
  }

  if (!prereqTopics.length) return []
  const masteryValues = await Promise.all(
    prereqTopics.map(prerequisiteTopic => getTopicMastery(supabase, userId, prerequisiteTopic))
  )

  return prereqTopics
    .map((pt: string, index: number) => ({ topic, prerequisiteTopic: pt, prerequisiteMastery: masteryValues[index] }))
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
