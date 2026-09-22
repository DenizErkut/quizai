export const QUIZ_PROVIDER_POLICY_VERSION = 'quiz-generation-v2-measured-2026-09-22'

export type QuizProviderDecision = 'mistral' | 'openai' | 'claude'
export interface QuizProviderPolicy { gptFraction: number; mistralFraction: number; claudeHoldoutFraction: number }

const bounded = (value: number, fallback: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback

export function getQuizProviderPolicy(env: NodeJS.ProcessEnv = process.env): QuizProviderPolicy {
  // Son 14 günlük üretim ölçümü: GPT daha hızlı/ucuz ve tamamlanma oranı güçlü;
  // örneklem tek kullanıcıyla sınırlı olduğu için %10 Claude kontrol grubu korunur.
  // Mistral, tamamlanmış kalite örneklemi oluşana kadar yalnızca admin/shadow'dur.
  const mistralFraction = bounded(Number(env.MISTRAL_LIVE_FRACTION ?? '0'), 0)
  const requestedGpt = bounded(Number(env.GPT_PILOT_FRACTION ?? '0.90'), 0.90)
  const gptFraction = Math.min(requestedGpt, 1 - mistralFraction)
  return { mistralFraction, gptFraction, claudeHoldoutFraction: Math.max(0, 1 - mistralFraction - gptFraction) }
}

export function decideQuizProvider(args: { bucket: number; hard: boolean; mistralConfigured: boolean; policy?: QuizProviderPolicy }): QuizProviderDecision {
  if (args.hard) return 'claude'
  const policy = args.policy ?? getQuizProviderPolicy()
  const normalizedBucket = Math.min(9999, Math.max(0, Math.trunc(args.bucket)))
  const mistralEnd = Math.round(policy.mistralFraction * 10_000)
  if (args.mistralConfigured && normalizedBucket < mistralEnd) return 'mistral'
  const gptEnd = mistralEnd + Math.round(policy.gptFraction * 10_000)
  return normalizedBucket < gptEnd ? 'openai' : 'claude'
}
