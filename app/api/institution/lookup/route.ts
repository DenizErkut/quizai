// Kurum kodunu doğrular ve yalnızca kurum ADINI döner (kayıt/profil formlarında "✓ X kurumuna bağlanıyor" için).
// Kurum tablosu istemciye doğrudan açık değildir; kod → ad eşlemesi yalnızca bu uçtan yapılır.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { allowByIp } from '@/lib/ip-throttle'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!allowByIp(req, 'institution-lookup', 30)) return NextResponse.json({ error: 'Çok sık deneme.' }, { status: 429 })
  const code = (req.nextUrl.searchParams.get('code') || '').trim().toUpperCase()
  if (!/^[A-Z0-9]{8}$/.test(code)) return NextResponse.json({ error: 'Geçersiz kurum kodu.' }, { status: 400 })
  const { data } = await db.from('institutions').select('name').eq('code', code).eq('active', true).maybeSingle()
  if (!data) return NextResponse.json({ error: 'Kurum bulunamadı.' }, { status: 404 })
  return NextResponse.json({ name: data.name }, { headers: { 'Cache-Control': 'no-store' } })
}
