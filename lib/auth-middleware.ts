// lib/auth-middleware.ts
// Merkezi auth yardımcısı — tüm API route'larında kullanılır

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type AuthResult =
  | { user: { id: string; email?: string }; error: null }
  | { user: null; error: NextResponse }

/**
 * Bearer token ile kullanıcıyı doğrular.
 * Başarısızsa hazır 401 response döner.
 * Kullanım: const { user, error } = await requireAuth(req); if (error) return error;
 */
export async function requireAuth(req: NextRequest): Promise<AuthResult> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { user: null, error: NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 }) }
  }
  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { user: null, error: NextResponse.json({ error: 'Oturum gecersiz.' }, { status: 401 }) }
  }
  return { user, error: null }
}

/**
 * Admin kontrolü — profiles.is_admin = true zorunlu
 */
export async function requireAdmin(req: NextRequest): Promise<AuthResult> {
  const result = await requireAuth(req)
  if (result.error) return result
  const { data: p } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', result.user.id).single()
  if (!p?.is_admin) {
    return { user: null, error: NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 }) }
  }
  return result
}

export { supabaseAdmin }
