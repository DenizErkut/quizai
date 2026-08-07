// lib/identity/resolve-client.ts
// İstemci tarafı kimlik çözümleme yardımcıları.
// Sayfalar isim/rol bilgisini doğrudan Supabase'den değil, TR-PG'ye bağlanan
// /api/identity/resolve endpoint'i üzerinden alır.
'use client'

export interface ResolvedIdentity {
  full_name: string
  role: string
}

// Birden çok kullanıcı id'si için isim/rol çöz (sınıf listesi, sıralama, vb.)
export async function resolveIdentities(
  supabase: any,
  ids: string[],
): Promise<Record<string, ResolvedIdentity>> {
  const clean = [...new Set(ids.filter(Boolean))]
  if (clean.length === 0) return {}
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return {}
    const res = await fetch('/api/identity/resolve', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: clean }),
    })
    if (!res.ok) return {}
    const { identities } = await res.json()
    return identities || {}
  } catch {
    return {}
  }
}

// Tek kullanıcının adını çöz (bulunamazsa null)
export async function resolveName(supabase: any, id: string): Promise<string | null> {
  if (!id) return null
  const map = await resolveIdentities(supabase, [id])
  return map[id]?.full_name ?? null
}

export interface OwnIdentity {
  full_name: string
  age: number | null
  phone: string | null
  parent_email: string | null
  institution_name: string | null
}

// Oturum sahibinin KENDİ kimlik kaydını (yaş, telefon dahil) getirir.
// resolveIdentities()'ten FARKLI olarak başka bir kullanıcı id'si kabul
// etmez — /api/identity/me, token'daki kullanıcıdan başka kimseye asla
// erişmez, bu yüzden yaş gibi hassas alanları güvenle döndürebilir.
export async function resolveOwnIdentity(supabase: any): Promise<OwnIdentity | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const res = await fetch('/api/identity/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (!res.ok) return null
    const { identity } = await res.json()
    return identity
  } catch {
    return null
  }
}
