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

// 23 Eylül 2026 — uyum raporu güncellemesinde tespit edilen boşluk: pilotun
// cohort='standard' ataması şimdiye kadar SADECE ölçüm tablosuna yazılıyordu,
// asıl soru üretimini hiç etkilemiyordu — yani "standard" öğrenciler de
// misconception_review/mastery_practice gibi müdahaleleri alabiliyordu. Bu
// fonksiyon, öğrencinin şu an aktif bir "standard" pilot atamasının 7 günlük
// gözlem penceresi içinde olup olmadığını kontrol eder; öyleyse konu/ders
// fark etmeksizin STANDARD_POLICY zorlanır. sample_version sabit tutuluyor
// çünkü adaptive_learning_evaluations'ın tek canlı pilotu bu.
const ADAPTIVE_PILOT_SAMPLE_VERSION = 'adaptive-learning-v3-pilot'

async function isActiveStandardPilotParticipant(supabase: SupabaseClient, studentId: string): Promise<boolean> {
  const { data } = await supabase.from('adaptive_learning_evaluations')
    .select('id').eq('student_id', studentId).eq('cohort', 'standard')
    .eq('sample_version', ADAPTIVE_PILOT_SAMPLE_VERSION)
    .gt('observation_started_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    .limit(1).maybeSingle()
  return !!data
}

export async function resolveAdaptiveLearningPolicy(
  supabase: SupabaseClient,
  studentId: string,
  topic: string,
  subject?: string
): Promise<AdaptiveLearningPolicy> {
  if (await isActiveStandardPilotParticipant(supabase, studentId).catch(() => false)) {
    return { ...STANDARD_POLICY, reasonCode: 'PILOT_STANDARD_COHORT', reason: 'Öğrenci adaptive-learning-v3-pilot çalışmasında standart kohorta atanmış; gözlem penceresi boyunca kişiselleştirme bilinçli olarak uygulanmıyor.' }
  }
  let overrideQuery = supabase.from('adaptive_teacher_overrides').select('id,reason').eq('student_id',studentId).ilike('topic',topic).eq('mode','standard').gt('expires_at',new Date().toISOString()).order('updated_at',{ascending:false}).limit(1)
  if(subject) overrideQuery=overrideQuery.ilike('subject',subject)
  const {data:override}=await overrideQuery.maybeSingle()
  if(override) return {...STANDARD_POLICY,reasonCode:'TEACHER_STANDARD_OVERRIDE',reason:override.reason||'Öğretmen bu konu için standart modu seçti.'}
  const baseQuery = () => supabase.from('student_recommendations')
    .select('id, action_type, reason_code, reason, evidence')
    .eq('student_id', studentId).in('status', ['active', 'accepted']).ilike('topic', topic)
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
