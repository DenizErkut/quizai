// app/api/admin/sellers/route.ts
// Satıcı listesi + her satıcının getirdiği kurum ve bireysel kullanıcı
// sayısı ("kim kaç kişi getirdi" raporu).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const { data: sellers, error: sellersErr } = await supabaseAdmin
    .from('sellers').select('*').order('created_at', { ascending: false })
  if (sellersErr) return NextResponse.json({ error: sellersErr.message }, { status: 500 })

  const { data: instRows } = await supabaseAdmin.from('institutions').select('seller_id').not('seller_id', 'is', null)
  const { data: profileRows } = await supabaseAdmin.from('profiles').select('seller_id').not('seller_id', 'is', null)

  const instCounts: Record<string, number> = {}
  ;(instRows ?? []).forEach((r: any) => { instCounts[r.seller_id] = (instCounts[r.seller_id] || 0) + 1 })
  const profileCounts: Record<string, number> = {}
  ;(profileRows ?? []).forEach((r: any) => { profileCounts[r.seller_id] = (profileCounts[r.seller_id] || 0) + 1 })

  const withCounts = (sellers ?? []).map((s: any) => ({
    ...s,
    institution_count: instCounts[s.id] || 0,
    individual_count: profileCounts[s.id] || 0,
  }))

  return NextResponse.json({ sellers: withCounts })
}
