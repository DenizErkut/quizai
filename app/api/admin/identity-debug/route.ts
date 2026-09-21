// app/api/admin/identity-debug/route.ts
//
// 21 Eylül 2026 — Deniz'in 2 gündür yaşadığı "Sana nasıl hitap edelim?"
// (profil kurulumu) döngüsünü teşhis etmek için GEÇİCİ, salt-okunur,
// sadece admin'e açık bir uç nokta. quiz/page.tsx'teki fetchProfile()
// kullanıcıyı /profile'a şu ikisinden biri eksikse gönderiyor: Supabase
// profiles.grade YA DA TR-PG'deki identities.full_name (resolveName).
// Vercel/Supabase loglarında hiçbir sunucu hatası yok — yani sorun varsa
// TR-PG (ayrı VPS Postgres) tarafında, buradan SQL ile erişilemeyen bir
// veri tutarsızlığında. Bu uç nokta, admin oturumuyla tarayıcıdan
// ziyaret edilip TR-PG'deki gerçek satırı görmek için var.
//
// GET /api/admin/identity-debug?supabase_user_id=<uuid>  (admin oturumu şart)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getIdentityBySupabaseId, getIdentitiesBySupabaseIds } from '@/lib/identity/client'

export const runtime = 'nodejs'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (n) => cookieStore.get(n)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: p } = await adminDb.from('profiles').select('is_admin').eq('id', user.id).single()
  return p?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const targetId = req.nextUrl.searchParams.get('supabase_user_id') || admin.id

  const { data: profileRow, error: profileErr } = await adminDb
    .from('profiles')
    .select('id, grade, language, onboarding_completed, priority_setup_completed, created_at, updated_at')
    .eq('id', targetId)
    .maybeSingle()

  let identityRow = null as any
  let identityError: string | null = null
  try {
    identityRow = await getIdentityBySupabaseId(targetId)
  } catch (e: any) {
    identityError = e?.message || 'TR-PG sorgu hatası'
  }

  let resolveMapResult: Record<string, any> = {}
  let resolveError: string | null = null
  try {
    resolveMapResult = await getIdentitiesBySupabaseIds([targetId])
  } catch (e: any) {
    resolveError = e?.message || 'TR-PG toplu sorgu hatası'
  }

  return NextResponse.json({
    checked_supabase_user_id: targetId,
    supabase_profiles_row: profileErr ? { error: profileErr.message } : profileRow,
    tr_pg_identity_single: identityError ? { error: identityError } : identityRow,
    tr_pg_identity_via_resolve_endpoint_path: resolveError ? { error: resolveError } : (resolveMapResult[targetId] ?? null),
    diagnosis: !profileRow
      ? 'Supabase profiles satırı yok — /profile bu yüzden çıkar.'
      : !profileRow.grade
        ? 'Supabase profiles.grade boş — /profile bu yüzden çıkar.'
        : identityError || resolveError
          ? 'TR-PG sorgusu hata veriyor (bağlantı sorunu olabilir) — detay için error alanına bak.'
          : !identityRow
            ? 'TR-PG\'de bu supabase_user_id için HİÇ satır yok — kimlik hiç oluşmamış ya da farklı bir id ile oluşmuş. Bu yüzden resolveName() hep null dönüyor ve /quiz sürekli /profile\'a atıyor.'
            : !identityRow.full_name
              ? 'TR-PG\'de satır var ama full_name boş/null — resolveName() bunu da null sayar.'
              : (resolveMapResult[targetId] ? 'Her şey normal görünüyor — full_name mevcut, resolve endpoint\'i de buluyor. Döngü başka bir nedenden olabilir.' : 'TR-PG\'de tekil satır var (full_name dolu) AMA toplu resolve sorgusu (identity/resolve, /quiz\'in kullandığı) bulamıyor — supabase_user_id sütun TİPİ/karşılaştırması uyuşmuyor olabilir.'),
  })
}
