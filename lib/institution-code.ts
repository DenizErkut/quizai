// lib/institution-code.ts
// Kurum davet kodu üretimi — hem admin panelinden yeni kurum oluştururken
// (code alanı boş bırakılırsa) hem de kurumun kendi panelinden kod
// üretirken/yenilerken (app/api/institution/regenerate-code) kullanılır.
// Tek yerden yönetildiği için iki akış arasında tutarsızlık oluşmaz.

import { SupabaseClient } from '@supabase/supabase-js'

// Karışabilecek karakterler (0/O, 1/I/L) çıkarıldı — öğrenciler kodu elle
// yazarken/okurken hata yapmasın diye.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateInstitutionCode(length = 8): string {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return code
}

/**
 * Veritabanında benzersiz bir kurum kodu üretir (çakışma ihtimaline karşı
 * birkaç kez dener). `supabaseAdmin`, service-role client olmalı.
 */
export async function generateUniqueInstitutionCode(
  supabaseAdmin: SupabaseClient,
  length = 8,
  maxAttempts = 10
): Promise<string | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateInstitutionCode(length)
    const { data: existing } = await supabaseAdmin
      .from('institutions').select('id').eq('code', candidate).maybeSingle()
    if (!existing) return candidate
  }
  return null
}
