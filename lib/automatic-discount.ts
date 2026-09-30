import type { SupabaseClient } from '@supabase/supabase-js'

export interface AutomaticDiscount {
  discountRate: number
  sellerId: string | null
  source: 'institution' | 'seller' | 'none'
  label: string
  institutionName: string | null
}

const noDiscount: AutomaticDiscount = { discountRate: 0, sellerId: null, source: 'none', label: '', institutionName: null }

export function safeDiscountRate(value: unknown): number {
  const rate = Number(value)
  return Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0
}

export function discountedPrice(basePrice: number, discountRate: number): number {
  return Math.round(basePrice * (1 - safeDiscountRate(discountRate) / 100) * 100) / 100
}

export async function resolveAutomaticDiscount(db: SupabaseClient, userId: string): Promise<AutomaticDiscount> {
  const { data: memberships, error: membershipError } = await db.from('institution_users')
    .select('institution_id').eq('user_id', userId).eq('is_active', true)
  if (membershipError) throw membershipError

  const institutionIds = [...new Set((memberships || []).map(member => member.institution_id))]
  if (institutionIds.length > 0) {
    const { data: institutions, error: institutionError } = await db.from('institutions')
      .select('id, name, discount_rate, active, seller_id').in('id', institutionIds)
    if (institutionError) throw institutionError
    const institution = (institutions || []).filter(item => item.active)
      .sort((a, b) => safeDiscountRate(b.discount_rate) - safeDiscountRate(a.discount_rate) || a.id.localeCompare(b.id))[0]
    if (institution && safeDiscountRate(institution.discount_rate) > 0) {
      return {
        discountRate: safeDiscountRate(institution.discount_rate),
        sellerId: institution.seller_id || null,
        source: 'institution',
        label: `${institution.name} kurumuna özel indirim`,
        institutionName: institution.name,
      }
    }
  }

  const { data: profile, error: profileError } = await db.from('profiles')
    .select('seller_id').eq('id', userId).maybeSingle()
  if (profileError) throw profileError
  if (!profile?.seller_id) return noDiscount

  const { data: seller, error: sellerError } = await db.from('sellers')
    .select('id, discount_rate, active').eq('id', profile.seller_id).maybeSingle()
  if (sellerError) throw sellerError
  if (!seller?.active || safeDiscountRate(seller.discount_rate) <= 0) return noDiscount
  return { discountRate: safeDiscountRate(seller.discount_rate), sellerId: seller.id, source: 'seller', label: 'Satıcı indirimi', institutionName: null }
}
