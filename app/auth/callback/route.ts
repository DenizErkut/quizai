import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createIdentity, getIdentityBySupabaseId } from '@/lib/identity/client'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const ref = requestUrl.searchParams.get('ref') // referral code
  const role = requestUrl.searchParams.get('role') || 'student'
  const nextParam = requestUrl.searchParams.get('next')
  const safeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/login')
    ? nextParam
    : null

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
        const identityParams = {
          supabaseUserId: user.id,
          fullName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Kullanıcı',
          email: user.email || '',
          role,
        }
        // Tek seferlik retry — TR-PG'ye geçici bağlantı sorunlarında (soğuk
        // pool, kısa kesinti) sessizce "İsimsiz" kalan kullanıcı bırakmamak
        // için. İkinci deneme de başarısız olursa login yine de engellenmez,
        // sadece loglanır (identity resolve edilene kadar admin panelinde
        // "İsimsiz" görünür, elle düzeltilebilir).
        await createIdentity(identityParams).catch(async (e) => {
          console.error('[auth/callback] createIdentity error (1. deneme):', e?.message)
          await new Promise(r => setTimeout(r, 500))
          await createIdentity(identityParams).catch((e2) =>
            console.error('[auth/callback] createIdentity error (2. deneme, vazgeçildi):', e2?.message)
          )
        })
      }

      // Profil var mi kontrol et
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      let needsProfileSetup = false
      if (!existing) {
        // Yeni kullanici - platform verisi (kimlik alanı TR-PG'de, buraya yazılmaz)
        await supabase.from('profiles').insert({
          id: user.id,
          grade: 'ortaokul 6. sinif',
          language: 'Türkçe',
        })

        needsProfileSetup = true
      }

      // Auth trigger profili önceden oluşturmuş olsa bile yeni OAuth
      // kullanıcılarında referans kodunu ilişkilendir. Eski hesapların
      // sonradan kendilerine davet yazmasını engellemek için kayıt zamanı
      // penceresiyle sınırlandırılır.
      const createdAt = Date.parse(user.created_at)
      const isNewAccount = Number.isFinite(createdAt) && Date.now() - createdAt < 15 * 60 * 1000
      if (ref && isNewAccount) {
        const { data: referrer } = await supabase
          .from('profiles')
          .select('id')
          .eq('referral_code', ref.toUpperCase())
          .maybeSingle()

        if (referrer && referrer.id !== user.id) {
          const { error: referralError } = await supabase.from('referrals').insert({
            referrer_id: referrer.id,
            referred_id: user.id,
          })
          if (referralError && referralError.code !== '23505') {
            console.error('[auth/callback] referral attribution failed:', referralError.message)
          }
        }
      }

      if (needsProfileSetup) {
        const profileUrl = new URL('/profile', requestUrl.origin)
        if (safeNext) profileUrl.searchParams.set('next', safeNext)
        return NextResponse.redirect(profileUrl)
      }
    }
  }

  return NextResponse.redirect(new URL(safeNext || '/home', requestUrl.origin))
}
