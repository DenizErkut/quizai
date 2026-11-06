// Tek alanlı giriş: e-posta, T.C. Kimlik No (11 hane) veya kurumsal Vergi No (10 hane) + şifre.
// Güvenlik: e-posta ASLA istemciye dönmez; şifre sunucuda doğrulanır, yalnızca oturum belirteçleri döner.
// Bilinmeyen/yanlış kimlik her durumda aynı genel hatayı verir (hesap sorgulamasını önlemek için).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { findSupabaseIdsByNationalId, findSupabaseIdsByPhone } from '@/lib/identity/client'
import { validateTcKimlikNo, normalizeTcKimlikNo } from '@/lib/tc-kimlik'
import { checkRateLimit } from '@/lib/rate-limit'
import { allowByIp } from '@/lib/ip-throttle'
import { randomUUID } from 'node:crypto'

export const runtime = 'nodejs'

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
// Hesap varlığını belli etmemek için başarısızlığın TÜM nedenleri (yanlış şifre, bilinmeyen kimlik, hesap sınırı) aynı yanıtı verir.
const GENERIC = { error: 'Kimlik bilgileri veya şifre hatalı ya da çok fazla deneme yapıldı. Biraz sonra tekrar dene.' }

async function candidateIds(identifier: string, mode: string): Promise<{ ids: string[]; email?: string }> {
  if (mode === 'phone') {
    const d = identifier.replace(/\D/g, '')
    return { ids: d.length >= 10 ? await findSupabaseIdsByPhone(d.slice(-10)) : [] }
  }
  if (identifier.includes('@')) return { ids: [], email: identifier.toLowerCase() }
  const digits = identifier.replace(/\s+/g, '')
  if (/^\d{11}$/.test(digits) && validateTcKimlikNo(normalizeTcKimlikNo(digits))) {
    return { ids: await findSupabaseIdsByNationalId(digits) }
  }
  if (/^\d{10}$/.test(digits)) {
    const { data: inst } = await admin.from('institutions').select('id').eq('tax_number', digits).maybeSingle()
    if (!inst) return { ids: [] }
    const { data: iu } = await admin.from('institution_users').select('user_id').eq('institution_id', inst.id).eq('role', 'admin').limit(3)
    return { ids: (iu || []).map(r => r.user_id as string) }
  }
  // Kullanıcı kodu: öğrencinin Pratium kodu (veli kodu). Şifre yine gerekir.
  if (/^[a-z0-9]{4,32}$/i.test(identifier)) {
    const { data } = await admin.from('profiles').select('id').eq('parent_code', identifier.toLowerCase()).limit(2)
    return { ids: (data || []).map(r => r.id as string) }
  }
  return { ids: [] }
}

export async function POST(req: NextRequest) {
  // Kimlikten bağımsız, IP başına sınır (en iyi çaba; kalıcı koruma Vercel Firewall kuralıyla birlikte düşünülmeli).
  if (!allowByIp(req, 'login-identifier', 12)) return NextResponse.json(GENERIC, { status: 429 })
  const body = await req.json().catch(() => null)
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim().slice(0, 200) : ''
  const password = typeof body?.password === 'string' ? body.password.slice(0, 200) : ''
  if (!identifier || !password) return NextResponse.json({ error: 'Kimlik ve şifre gerekli.' }, { status: 400 })
  // E-posta ile giriş tarayıcıdan doğrudan Supabase'e yapılır: tüm girişleri tek sunucu IP'sine yığmayız
  // (Supabase'in IP başına oturum sınırı ortak kovaya düşmesin).
  if (identifier.includes('@')) return NextResponse.json({ error: 'E-posta ile giriş bu uçtan yapılmaz.' }, { status: 400 })

  const mode = body?.mode === 'phone' ? 'phone' : 'id'
  const { ids } = await candidateIds(identifier, mode)
  const emails: string[] = []
  for (const id of ids.slice(0, 5)) {
    // Hesap başına günlük sınır: aşılırsa deneme yapılmaz ama yanıt yine aynıdır (varlık sızmaz).
    const rl = await checkRateLimit(id, { endpoint: 'login-identifier', limit: 30 })
    if (!rl.allowed) continue
    const { data } = await admin.auth.admin.getUserById(id)
    if (data?.user?.email) emails.push(data.user.email)
  }

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const e of emails) {
    const { data, error } = await anon.auth.signInWithPassword({ email: e, password })
    if (!error && data.session) {
      return NextResponse.json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
    }
  }
  // Zamanlama farkı hesap varlığını sızdırmasın: aday yoksa da benzer maliyette bir doğrulama çağrısı yapılır.
  if (emails.length === 0) await anon.auth.signInWithPassword({ email: `no-user-${randomUUID()}@invalid.example`, password }).catch(() => undefined)
  return NextResponse.json(GENERIC, { status: 401 })
}
