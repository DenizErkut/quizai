// app/api/identity/resolve/route.ts
// İstemci tarafı sayfaların isim/kimlik çekeceği merkezi endpoint.
// Kimlik verisi (ad-soyad, rol) yalnızca TR-PG'den okunur — Supabase'e dokunmaz.
//
// Sözleşme:
//   POST { ids: string[] }
//   -> { identities: { [supabaseUserId]: { full_name: string, role: string } } }
//
// Erişim: yalnızca kimliği doğrulanmış (oturum açmış) kullanıcılar çağırabilir.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { checkRateLimit, rateLimitExceeded } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  ) as any

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  let ids: unknown
  try {
    ({ ids } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
  }

  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !UUID.test(id))) {
    return NextResponse.json({ error: 'ids bir UUID dizisi olmalı.' }, { status: 400 })
  }
  // Toplu kimlik sızdırma/tarama koruması: tek istekte en çok 200 kimlik, kullanıcı başına günlük sınır.
  const uniqueIds = [...new Set(ids as string[])]
  if (uniqueIds.length > 200) return NextResponse.json({ error: 'Tek istekte en fazla 200 kimlik çözümlenebilir.' }, { status: 413 })
  const limit = await checkRateLimit(user.id, { endpoint: 'identity-resolve', limit: 3000 })
  if (!limit.allowed) return rateLimitExceeded(limit)

  try {
    const map = await getIdentitiesBySupabaseIds(uniqueIds)
    const identities: Record<string, { full_name: string; role: string }> = {}
    for (const [id, identity] of Object.entries(map)) {
      // Rol bilgisi yalnızca kullanıcının kendi kaydı için döner (başkalarının rolü sızdırılmaz).
      identities[id] = { full_name: identity.full_name, role: id === user.id ? identity.role : '' }
    }
    return NextResponse.json({ identities })
  } catch (e) {
    console.error('[identity/resolve] error:', e.message)
    return NextResponse.json({ error: 'Kimlik çözümlenemedi.' }, { status: 500 })
  }
}
