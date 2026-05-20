import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

// Admin client — referral işlemi için RLS bypass
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const ref = requestUrl.searchParams.get('ref') // referral kodu

  if (code) {
    const cookieStore = await cookies()
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
      // Profil var mı kontrol et
      const { data: existing } = await supabaseAdmin
        .from('profiles')
        .select('id, referral_code')
        .eq('id', user.id)
        .single()

      if (!existing) {
        // Yeni kullanıcı — profil oluştur
        await supabaseAdmin.from('profiles').insert({
          id: user.id,
          name: user.user_metadata?.full_name ||
                user.user_metadata?.name ||
                user.email?.split('@')[0] || 'Kullanici',
          grade: 'ortaokul 6. sinif',
          language: 'Türkçe',
          plan: 'free',
          monthly_test_count: 0,
        })

        // Referral kodu işle
        if (ref) {
          await processReferral(user.id, ref)
        }

        // Yeni kullanıcı → profil kurulumuna yönlendir
        return NextResponse.redirect(new URL('/profile', requestUrl.origin))
      }

      // Mevcut kullanıcı → quiz'e yönlendir
      return NextResponse.redirect(new URL('/quiz', requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin))
}

async function processReferral(newUserId: string, refCode: string) {
  try {
    // Referral kodu sahibini bul
    const { data: referrer } = await supabaseAdmin
      .from('profiles')
      .select('id, name')
      .eq('referral_code', refCode.toUpperCase())
      .single()

    if (!referrer) {
      console.log('Referral code not found:', refCode)
      return
    }

    // Kendi kendini davet etme kontrolü
    if (referrer.id === newUserId) {
      console.log('Self-referral blocked')
      return
    }

    // Daha önce bu kullanıcı davet edilmiş mi?
    const { data: existingReferral } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referred_id', newUserId)
      .single()

    if (existingReferral) {
      console.log('User already referred')
      return
    }

    // Referral kaydı oluştur — trigger otomatik çalışır
    const { error } = await supabaseAdmin.from('referrals').insert({
      referrer_id: referrer.id,
      referred_id: newUserId,
    })

    if (error) {
      console.error('Referral insert error:', error)
      return
    }

    console.log(`Referral processed: ${referrer.name} invited new user`)
  } catch (e) {
    console.error('processReferral error:', e)
  }
}
