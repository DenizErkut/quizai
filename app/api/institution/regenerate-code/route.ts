// app/api/institution/regenerate-code/route.ts
// Kurum yöneticisi kendi davet kodunu üretir/yeniler. Bu koddan sonra kayıt olan
// (veya /profile'daki "Kurum Kodu" alanına giren) TÜM öğrenciler otomatik olarak
// institution_users üzerinden bu kurumun öğrenci listesine ekleniyor — bu akış
// zaten /register ve /profile onboarding'de mevcut (bkz. institution_code kontrolü).
// Bu route sadece kodun ÜRETİMİNİ kurum yöneticisinin kendi eline veriyor;
// önceden bu işlem sadece Pratium admin panelinden (kurum oluşturulurken) yapılabiliyordu.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateUniqueInstitutionCode } from '@/lib/institution-code'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const supabaseUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  // Sadece o kurumun admin'i kendi kodunu üretebilir
  const { data: instUser } = await supabaseAdmin
    .from('institution_users')
    .select('institution_id')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .maybeSingle()

  if (!instUser) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  // Benzersiz kod üretilene kadar dene (ortak yardımcı fonksiyon —
  // admin panelindeki kurum oluşturma akışıyla aynı mantığı kullanır)
  const newCode = await generateUniqueInstitutionCode(supabaseAdmin, 8)

  if (!newCode) {
    return NextResponse.json({ error: 'Kod üretilemedi, lütfen tekrar deneyin.' }, { status: 500 })
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('institutions')
    .update({ code: newCode })
    .eq('id', instUser.institution_id)
    .select('code')
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, code: updated.code })
}
