// lib/referral-code.ts
//
// Checkout ekranındaki "Satıcı/Kurum Kodu" alanı ile app/api/checkout/apply-code
// (canlı önizleme) ve app/api/paytr/checkout (asıl tahsilat) arasında
// PAYLAŞILAN çözümleme mantığı — ikisi de AYNI kodu AYNI şekilde çözmeli,
// yoksa ekranda gösterilen indirim ile gerçekte tahsil edilen tutar
// birbirinden sapabilir.
//
// Önce sellers, sonra institutions tablosuna bakılır (iki ayrı, birbirinden
// bağımsız kod alanı — teorik bir çakışma olursa satıcı önceliklidir).
export interface ResolvedDiscountCode {
  found: boolean
  discountRate: number
  sellerId: string | null
  label: string
}

export async function resolveDiscountCode(supabaseAdmin: any, rawCode: string): Promise<ResolvedDiscountCode> {
  const code = (rawCode || '').toUpperCase().trim()
  if (!code) return { found: false, discountRate: 0, sellerId: null, label: '' }

  const { data: seller } = await supabaseAdmin
    .from('sellers').select('id, discount_rate, active').eq('code', code).maybeSingle()
  if (seller?.active) {
    return {
      found: true,
      discountRate: Number(seller.discount_rate) || 0,
      sellerId: seller.id,
      label: 'Satıcı kodu uygulandı',
    }
  }

  const { data: institution } = await supabaseAdmin
    .from('institutions').select('id, name, discount_rate, active, seller_id').eq('code', code).maybeSingle()
  if (institution?.active) {
    return {
      found: true,
      discountRate: Number(institution.discount_rate) || 0,
      sellerId: institution.seller_id || null,
      label: `${institution.name} kurum kodu uygulandı`,
    }
  }

  return { found: false, discountRate: 0, sellerId: null, label: '' }
}
