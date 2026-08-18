// app/api/parent/child-consent/route.ts
//
// 18 Ağustos 2026 — Madde 7 (pratium-bekleyen-isler-uygulama-plani.md):
// veli panelinde çocuğun rıza durumunun görünürlüğü. Sadece SALT-OKUNUR —
// veli buradan onayı DEĞİŞTİREMEZ (gerçek veli-kimlik doğrulaması olmadan
// bir veliye çocuk adına onay değiştirme yetkisi vermek KVKK açısından
// riskli olurdu — bilinçli bir sınır, bkz. plan Madde 7).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentityBySupabaseId, getConsentStatus } from '@/lib/identity/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const childId = searchParams.get('childId')
  if (!childId) return NextResponse.json({ error: 'childId gerekli.' }, { status: 400 })

  // Bu veli gerçekten bu çocuğa bağlı mı? (parent_children — app/parent/
  // page.tsx'in kullandığı AYNI Supabase tablosu, yetkilendirme burada bu
  // tabloya dayanıyor.)
  const { data: link } = await supabaseAdmin
    .from('parent_children').select('id').eq('parent_id', user.id).eq('child_id', childId).maybeSingle()
  if (!link) return NextResponse.json({ error: 'Bu çocuğa erişiminiz yok.' }, { status: 403 })

  const identity = await getIdentityBySupabaseId(childId)
  if (!identity) return NextResponse.json({ hasIdentity: false, status: [] })

  const applicable = ['aydinlatma', 'acik_riza_analiz']
  if (identity.age != null && identity.age < 18) applicable.push('veli_onayi')

  const status = await getConsentStatus(identity.id, applicable)
  return NextResponse.json({ hasIdentity: true, status })
}
