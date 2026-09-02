import { SupabaseClient } from '@supabase/supabase-js'
import type { DifficultyValue } from './adaptive-difficulty'

export type AdaptiveFocus = 'prerequisite' | 'misconception' | 'retrieval' | 'foundations' | 'standard'

export interface AdaptiveLearningPolicy {
  version: 'v2'
  focus: AdaptiveFocus
  reasonCode: string
  reason: string
  recommendationId: string | null
  startingDifficulty: DifficultyValue | null
  promptContext: string
}

interface RecommendationRow {
  id: string
  action_type: string
  reason_code: string
  reason: string
  evidence: Record<string, unknown> | null
}

const STANDARD_POLICY: AdaptiveLearningPolicy = {
  version: 'v2', focus: 'standard', reasonCode: 'NO_ACTIVE_SIGNAL',
  reason: 'Bu konu için henüz güçlü bir kişiselleştirme sinyali yok.',
  recommendationId: null, startingDifficulty: null, promptContext: '',
}

export async function resolveAdaptiveLearningPolicy(
  supabase: SupabaseClient,
  studentId: string,
  topic: string,
  subject?: string
): Promise<AdaptiveLearningPolicy> {
  const baseQuery = () => supabase.from('student_recommendations')
    .select('id, action_type, reason_code, reason, evidence')
    .eq('student_id', studentId).eq('status', 'active').ilike('topic', topic)
    .gt('valid_until', new Date().toISOString())
    .order('priority_score', { ascending: false }).limit(1)
  let { data } = subject
    ? await baseQuery().ilike('subject', subject).maybeSingle()
    : await baseQuery().maybeSingle()
  // Legacy mastery rows may still carry subject="Genel". Topic remains
  // student-scoped, so retry without subject rather than losing adaptation.
  if (!data && subject) ({ data } = await baseQuery().maybeSingle())
  if (!data) return STANDARD_POLICY

  return policyFromRecommendation(data as RecommendationRow)
}

export function policyFromRecommendation(row: RecommendationRow): AdaptiveLearningPolicy {
  const evidence = row.evidence || {}
  const label = typeof evidence.label === 'string' ? evidence.label : ''

  switch (row.action_type) {
    case 'prerequisite_remediation':
      return {
        version: 'v2', focus: 'prerequisite', reasonCode: row.reason_code,
        reason: row.reason, recommendationId: row.id, startingDifficulty: 'kolay',
        promptContext: '\n\nADAPTİF ODAK: Öğrencinin ön koşul temeli eksik. İlk sorularda gerekli temel kavramı kısa ve somut örneklerle yokla; asıl konuya kademeli geç.',
      }
    case 'misconception_review':
      return {
        version: 'v2', focus: 'misconception', reasonCode: row.reason_code,
        reason: row.reason, recommendationId: row.id, startingDifficulty: 'kolay',
        promptContext: `\n\nADAPTİF ODAK: Tekrar eden olası kavram yanılgısı${label ? `: "${label}"` : ''}. Öğrenciyi etiketlemeden, doğru ve yanlış düşünceyi ayırt ettiren 1-2 karşılaştırmalı soru üret; ardından normal konu sorularına geç.`,
      }
    case 'spaced_review':
      return {
        version: 'v2', focus: 'retrieval', reasonCode: row.reason_code,
        reason: row.reason, recommendationId: row.id, startingDifficulty: 'normal',
        promptContext: '\n\nADAPTİF ODAK: Bu konu tekrar zamanına ulaştı. İlk 1-2 soruyu temel bilgiyi ipucusuz hatırlatacak geri çağırma soruları olarak üret, sonra uygulamaya geç.',
      }
    case 'mastery_practice': {
      const mastery = Number(evidence.masteryScore)
      return {
        version: 'v2', focus: 'foundations', reasonCode: row.reason_code,
        reason: row.reason, recommendationId: row.id,
        startingDifficulty: Number.isFinite(mastery) && mastery < 40 ? 'kolay' : 'normal',
        promptContext: '\n\nADAPTİF ODAK: Öğrencinin bu konudaki mastery düzeyi düşük. Temel kavramlardan başla, her soruda yalnızca bir zihinsel adım ekleyerek zorluğu kademeli artır.',
      }
    }
    default:
      return STANDARD_POLICY
  }
}
