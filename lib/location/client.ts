'use client'
// Tarayıcıdan oturum sahibinin konumunu okuyup yazan küçük yardımcılar (/api/profile/location).
import { createClient } from '@/lib/supabase/client'
import type { LocationDetails } from '@/lib/location/validate'

async function authHeader(): Promise<Record<string, string> | null> {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : null
}

/** Konumu sunucuda doğrulatıp kaydeder; başarılıysa true. */
export async function saveProfileLocation(details: LocationDetails): Promise<boolean> {
  try {
    const auth = await authHeader()
    if (!auth) return false
    const response = await fetch('/api/profile/location', {
      method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(details),
    })
    return response.ok
  } catch { return false }
}

/** Kayıtlı konumu getirir (formu önceden doldurmak için); okunamazsa null. */
export async function loadProfileLocation(): Promise<Partial<LocationDetails> | null> {
  try {
    const auth = await authHeader()
    if (!auth) return null
    const response = await fetch('/api/profile/location', { headers: auth })
    return response.ok ? await response.json() : null
  } catch { return null }
}
