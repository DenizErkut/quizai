export type BillingPlanKey =
  | 'silver_monthly' | 'silver_yearly'
  | 'gold_monthly' | 'gold_yearly'
  | 'platinum_monthly' | 'platinum_yearly'

export interface BillingPlan {
  price: number
  months: 1 | 12
  profilePlan: 'silver' | 'premium' | 'unlimited'
  displayName: string
  tierName: 'Gümüş' | 'Altın' | 'Platin'
  period: 'ay' | 'yıl'
}

export const BILLING_PLANS: Record<BillingPlanKey, BillingPlan> = {
  silver_monthly: { price: 299, months: 1, profilePlan: 'silver', displayName: 'Pratium Gümüş - Aylık', tierName: 'Gümüş', period: 'ay' },
  silver_yearly: { price: 2490, months: 12, profilePlan: 'silver', displayName: 'Pratium Gümüş - Yıllık', tierName: 'Gümüş', period: 'yıl' },
  gold_monthly: { price: 499, months: 1, profilePlan: 'premium', displayName: 'Pratium Altın - Aylık', tierName: 'Altın', period: 'ay' },
  gold_yearly: { price: 4490, months: 12, profilePlan: 'premium', displayName: 'Pratium Altın - Yıllık', tierName: 'Altın', period: 'yıl' },
  platinum_monthly: { price: 2399, months: 1, profilePlan: 'unlimited', displayName: 'Pratium Platin - Aylık', tierName: 'Platin', period: 'ay' },
  platinum_yearly: { price: 19990, months: 12, profilePlan: 'unlimited', displayName: 'Pratium Platin - Yıllık', tierName: 'Platin', period: 'yıl' },
}

// Pending payments and old bookmarked checkout URLs remain valid.
export const LEGACY_BILLING_PLAN_ALIASES: Record<string, BillingPlanKey> = {
  silver: 'silver_yearly', monthly: 'gold_monthly', yearly: 'gold_yearly', unlimited: 'platinum_yearly',
}

export function resolveBillingPlanKey(value: unknown): BillingPlanKey | null {
  if (typeof value !== 'string') return null
  if (value in BILLING_PLANS) return value as BillingPlanKey
  return LEGACY_BILLING_PLAN_ALIASES[value] || null
}
