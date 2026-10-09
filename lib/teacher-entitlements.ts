// Teacher membership policy (pure, unit-testable). Teachers outside an institution get a limited
// tier unless they hold a paid Altın-or-higher plan, an active grant, or have earned the grant by
// bringing students who bought a yearly Altın membership. All numbers live here.
import { resolveBillingPlanKey } from './subscription-plans'

export const TEACHER_INVITE_TARGET = 10
export const TEACHER_GRANT_DAYS = 365
export const TEACHER_GRACE_DAYS = 30 // existing teachers keep full access for this long after launch

export const FREE_TEACHER_LIMITS = {
  aiGenerations: 1,        // lifetime AI creations (open-ended batch / live quiz questions count as one each)
  liveQuizzesPerMonth: 1,
  dashboardStudents: 5,    // students visible in the class dashboard
} as const

export type TeacherFeature = 'ai_generation' | 'live_quiz' | 'export_import' | 'analytics'
export type TeacherAccessSource = 'institution' | 'grant' | 'paid_plan' | 'invite_gold' | 'limited'

export type TeacherAccessInput = {
  institutionLinked: boolean
  profilePlan: string | null
  planExpiresAt: string | null
  grant: { expires_at: string } | null
  qualifyingStudents: number
  now: Date
}

export type TeacherAccess = { tier: 'full' | 'limited'; source: TeacherAccessSource; shouldGrant: boolean }

const alive = (iso: string | null | undefined, now: Date) => !iso || new Date(iso).getTime() > now.getTime()

export function decideTeacherAccess(input: TeacherAccessInput): TeacherAccess {
  if (input.institutionLinked) return { tier: 'full', source: 'institution', shouldGrant: false }
  if (input.grant && alive(input.grant.expires_at, input.now)) return { tier: 'full', source: 'grant', shouldGrant: false }
  if ((input.profilePlan === 'premium' || input.profilePlan === 'unlimited') && alive(input.planExpiresAt, input.now)) {
    return { tier: 'full', source: 'paid_plan', shouldGrant: false }
  }
  if (input.qualifyingStudents >= TEACHER_INVITE_TARGET) return { tier: 'full', source: 'invite_gold', shouldGrant: true }
  return { tier: 'limited', source: 'limited', shouldGrant: false }
}

export type StudentSubscription = { user_id: string; plan: string | null; status: string | null; price_paid: number | string | null; current_period_end: string | null }

/** Students whose paid yearly Altın (or Platin) membership is active; own account and duplicates excluded. */
export function countQualifyingStudents(subs: StudentSubscription[], teacherUserId: string, now: Date): number {
  const students = new Set<string>()
  for (const sub of subs) {
    if (sub.user_id === teacherUserId || sub.status !== 'active') continue
    if (!(Number(sub.price_paid) > 0)) continue // admin/pilot grants and free codes do not count
    if (!alive(sub.current_period_end, now) || !sub.current_period_end) continue
    const key = resolveBillingPlanKey(sub.plan)
    if (key === 'gold_yearly' || key === 'platinum_yearly') students.add(sub.user_id)
  }
  return students.size
}

export type FeatureDecision = { allowed: boolean; reason?: string }

export function decideFeature(access: TeacherAccess, feature: TeacherFeature, usage: { aiTotal: number; liveThisMonth: number }): FeatureDecision {
  if (access.tier === 'full') return { allowed: true }
  switch (feature) {
    case 'ai_generation':
      return usage.aiTotal < FREE_TEACHER_LIMITS.aiGenerations ? { allowed: true }
        : { allowed: false, reason: `Ücretsiz öğretmen hesabında ${FREE_TEACHER_LIMITS.aiGenerations} adet yapay zekâ ile oluşturma hakkı vardır ve kullanıldı.` }
    case 'live_quiz':
      return usage.liveThisMonth < FREE_TEACHER_LIMITS.liveQuizzesPerMonth ? { allowed: true }
        : { allowed: false, reason: `Ücretsiz öğretmen hesabında ayda ${FREE_TEACHER_LIMITS.liveQuizzesPerMonth} canlı quiz oluşturulabilir.` }
    case 'export_import':
      return { allowed: false, reason: 'PDF/basılı çıktı ve kâğıt/not içe aktarma yalnızca Altın üyelikte açıktır.' }
    case 'analytics':
      return { allowed: false, reason: 'Gelişmiş sınıf analizleri yalnızca Altın üyelikte açıktır.' }
  }
}
