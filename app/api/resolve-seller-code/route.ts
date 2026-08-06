// app/api/resolve-seller-code/route.ts
// Kayıt sayfasındaki ?satici=KOD linki için — sellers tablosu service_role
// ile korunuyor (PII/komisyon içerdiği için), bu route SADECE id+isim
// döndüren güvenli, herkese açık bir çözümleyici.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const code = (req.nextUrl.searchParams.get('code') || '').toUpperCase().trim()
  if (!code) return NextResponse.json({ seller_id: null })

  const { data } = await supabaseAdmin
    .from('sellers')
    .select('id, full_name')
    .eq('code', code)
    .eq('active', true)
    .maybeSingle()

  return NextResponse.json({ seller_id: data?.id || null, seller_name: data?.full_name || null })
}
