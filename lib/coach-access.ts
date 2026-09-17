// lib/coach-access.ts — Pratium Koç'un plan bazlı erişim kuralı.
//
// 17 Eylül 2026 — Deniz'in kararı: Koç ücretsiz (free) plana kesinlikle
// AÇIK OLMASIN — sadece ücretli üyeler (silver/premium/unlimited)
// kullanabilsin. Bu dosya BİLEREK lib/coach-generation.ts'ten AYRI: o
// dosya modül yüklenirken Anthropic SDK'sını ve ANTHROPIC_API_KEY'i
// kullanıyor, yani sadece sunucu tarafında import edilebilir. Bu dosyanın
// hiçbir sunucuya-özel bağımlılığı yok, bu yüzden hem API route'larından
// (app/api/coach/chat/route.ts) hem de istemci bileşenlerinden
// (components/CoachMascot.tsx, app/koc/page.tsx) güvenle import edilebilir.
export const COACH_ELIGIBLE_PLANS = ['silver', 'premium', 'unlimited'] as const

export function isPaidCoachPlan(plan: string | null | undefined): boolean {
  return !!plan && (COACH_ELIGIBLE_PLANS as readonly string[]).includes(plan)
}

export const COACH_PLAN_REQUIRED_MESSAGE =
  'Pratium Koç ücretli üyelere özel bir özelliktir. Bu özelliği kullanmak için planını yükseltebilirsin.'
