import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createIdentity, getIdentityBySupabaseId } from '@/lib/identity/client'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const ref = requestUrl.searchParams.get('ref') // referral code
  const role = requestUrl.searchParams.get('role') || 'student'

  if (code) {
    const cookieStore = await cookies()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    ) as any

    await supabase.auth.exchangeCodeForSession(code)

    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // Kimlik (ad-soyad/e-posta) TR-PG'de yaşar — yoksa oluştur (idempotent).
      // Not: profiles satırı handle_new_user trigger'ı tarafından zaten oluşturulur,
      // bu yüzden identity oluşturmayı 'existing' kontrolünün DIŞINDA yapıyoruz.
      const existingIdentity = await getIdentityBySupabaseId(user.id)
      if (!existingIdentity) {
        await createIdentity({
          supabaseUserId: user.id,
          fullName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Kullanıcı',
          email: user.email || '',
          role,
        }).catch((e) => console.error('[auth/callback] createIdentity error:', e?.message))
      }

      // Profil var mi kontrol et
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!existing) {
        // Yeni kullanici - platform verisi (kimlik alanı TR-PG'de, buraya yazılmaz)
        await supabase.from('profiles').insert({
          id: user.id,
          grade: 'ortaokul 6. sinif',
          language: 'Türkçe',
        })

        // Referral kodu varsa isle
        if (ref) {
          const { data: referrer } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', ref)
            .single()

          if (referrer && referrer.id !== user.id) {
            await supabase.from('referrals').insert({
              referrer_id: referrer.id,
              referred_id: user.id,
            })
          }
        }

        // Yeni kullanici - profil kurulumuna yonlendir
        return NextResponse.redirect(new URL('/profile', requestUrl.origin))
      }
    }
  }

  return NextResponse.redirect(new URL('/quiz', requestUrl.origin))
}
