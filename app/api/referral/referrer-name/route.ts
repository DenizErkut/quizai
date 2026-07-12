// app/api/referral/referrer-name/route.ts
// Kayıt sayfasında "X seni davet etti" karşılaması için referans kodunun
// sahibinin YALNIZCA ilk adını döndürür. Kimlik verisi TR-PG'de olduğundan ve
// kayıt sayfası henüz oturumsuz olduğundan bu küçük genel endpoint gerekir.
// Yalnızca ilk ad döner — minimum kişisel veri.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentityBySupabaseId } from '@/lib/identity/client'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ firstName: null })

  try {
    // Referans kodundan kullanıcı id'sini bul (kod kimlik verisi değildir)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('referral_code', code.toUpperCase())
      .maybeSingle()
    if (!profile) return NextResponse.json({ firstName: null })

    const identity = await getIdentityBySupabaseId(profile.id)
    const firstName = identity?.full_name?.split(' ')[0] ?? null
    return NextResponse.json({ firstName })
  } catch (e: any) {
    console.error('[referral/referrer-name] error:', e.message)
    return NextResponse.json({ firstName: null })
  }
}
