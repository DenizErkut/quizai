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
import { createClient } from '@supabase/supabase-js'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'

export const runtime = 'nodejs'

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

  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) {
    return NextResponse.json({ error: 'ids bir string dizisi olmalı.' }, { status: 400 })
  }

  try {
    const map = await getIdentitiesBySupabaseIds(ids as string[])
    const identities: Record<string, { full_name: string; role: string }> = {}
    for (const [id, identity] of Object.entries(map)) {
      identities[id] = { full_name: identity.full_name, role: identity.role }
    }
    return NextResponse.json({ identities })
  } catch (e: any) {
    console.error('[identity/resolve] error:', e.message)
    return NextResponse.json({ error: 'Kimlik çözümlenemedi.' }, { status: 500 })
  }
}
