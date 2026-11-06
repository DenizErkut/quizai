// QR giriş: POST → yeni istek (id + gizli değer), GET → durum yoklama (onaylandıysa tek kullanımlık belirteç).
import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server-create-client'
import { allowByIp } from '@/lib/ip-throttle'

export const runtime = 'nodejs'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const hash = (v: string) => createHash('sha256').update(v).digest('hex')

export async function POST(req: NextRequest) {
  if (!allowByIp(req, 'qr-create', 8)) return NextResponse.json({ error: 'Çok sık deneme.' }, { status: 429 })
  const secret = randomBytes(24).toString('hex')
  await admin.from('qr_login_requests').delete().lt('expires_at', new Date(Date.now() - 3600_000).toISOString())
  const { data, error } = await admin.from('qr_login_requests').insert({ secret_hash: hash(secret) }).select('id').single()
  if (error || !data) return NextResponse.json({ error: 'QR oluşturulamadı.' }, { status: 500 })
  return NextResponse.json({ id: data.id, secret, expiresInSeconds: 180 })
}

export async function GET(req: NextRequest) {
  if (!allowByIp(req, 'qr-poll', 60)) return NextResponse.json({ status: 'invalid' }, { status: 429 })
  const id = req.nextUrl.searchParams.get('id') || ''
  const secret = req.nextUrl.searchParams.get('secret') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id) || secret.length < 20) return NextResponse.json({ status: 'invalid' }, { status: 400 })
  const { data } = await admin.from('qr_login_requests').select('secret_hash,status,token_hash,expires_at').eq('id', id).maybeSingle()
  if (!data || data.secret_hash !== hash(secret) || new Date(data.expires_at) < new Date()) return NextResponse.json({ status: 'expired' })
  if (data.status === 'pending') return NextResponse.json({ status: 'pending' })
  if (data.status === 'approved' && data.token_hash) {
    // Tek kullanımlık: yalnızca ilk yoklama belirteci alır.
    const { data: claimed } = await admin.from('qr_login_requests').update({ status: 'consumed', token_hash: null }).eq('id', id).eq('status', 'approved').select('id').maybeSingle()
    if (claimed) return NextResponse.json({ status: 'approved', token_hash: data.token_hash })
  }
  return NextResponse.json({ status: 'expired' })
}
