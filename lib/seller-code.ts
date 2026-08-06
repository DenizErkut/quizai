// lib/seller-code.ts
// Bağımsız platform satıcısı (bireysel pazarlamacı) kodu üretimi —
// lib/institution-code.ts ile aynı desen/karakter seti, tutarlılık için.

import { SupabaseClient } from '@supabase/supabase-js'

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateSellerCode(length = 7): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

export async function generateUniqueSellerCode(
  supabaseAdmin: SupabaseClient,
  length = 7,
  maxAttempts = 10
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateSellerCode(length)
    const { data: existing } = await supabaseAdmin
      .from('sellers').select('id').eq('code', candidate).maybeSingle()
    if (!existing) return candidate
  }
  return null
}
