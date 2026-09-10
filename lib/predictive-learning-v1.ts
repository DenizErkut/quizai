export type PredictiveInput = { mastery: number; retention: number; trend: 'improving' | 'stable' | 'declining'; lastPracticedAt: string | null }

export function calculateLearningRisk(input: PredictiveInput) {
  const daysInactive = input.lastPracticedAt ? Math.max(0, Math.floor((Date.now() - new Date(input.lastPracticedAt).getTime()) / 86_400_000)) : 30
  const masteryRisk = Math.max(0, 100 - input.mastery) * 0.4
  const retentionRisk = Math.max(0, 100 - input.retention) * 0.35
  const inactivityRisk = Math.min(daysInactive / 30, 1) * 15
  const trendRisk = input.trend === 'declining' ? 10 : input.trend === 'improving' ? -5 : 0
  const score = Math.max(0, Math.min(100, Math.round(masteryRisk + retentionRisk + inactivityRisk + trendRisk)))
  const level = score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low'
  const evidence = [
    input.mastery < 50 ? 'low_mastery' : null,
    input.retention < 50 ? 'low_retention' : null,
    daysInactive >= 14 ? 'long_inactivity' : null,
    input.trend === 'declining' ? 'declining_trend' : null,
  ].filter(Boolean)
  return { score, level, days_inactive: daysInactive, evidence, policy_version: 'predictive-learning-v1' }
}
