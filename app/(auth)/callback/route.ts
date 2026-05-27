import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const ref = requestUrl.searchParams.get('ref') // referral code

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
      const role = requestUrl.searchParams.get('role') || 'student'

      // Profil var mi kontrol et
      const { data: existing } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', user.id)
        .maybeSingle()

      if (!existing) {
        // Yeni kullanici - role gore profil olustur
        await supabase.from('profiles').insert({
          id: user.id,
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Kullanici',
          grade: role === 'student' ? 'ortaokul 6. sinif' : null,
          language: 'Türkçe',
          role,
        })

        // Referral kodu varsa isle
        if (ref) {
          const { data: referrer } = await supabase
            .from('profiles').select('id').eq('referral_code', ref).single()
          if (referrer && referrer.id !== user.id) {
            await supabase.from('referrals').insert({ referrer_id: referrer.id, referred_id: user.id })
          }
        }

        // Role gore yonlendir
        if (role === 'teacher') return NextResponse.redirect(new URL('/register/teacher?step=info', requestUrl.origin))
        if (role === 'parent') return NextResponse.redirect(new URL('/parent', requestUrl.origin))
        return NextResponse.redirect(new URL('/profile', requestUrl.origin))
      }

      // Mevcut kullanici - role gore yonlendir
      const userRole = existing.role || 'student'
      if (userRole === 'teacher') {
        // Öğretmen onaylı mi?
        const { data: teacher } = await supabase.from('teachers').select('approved').eq('user_id', user.id).maybeSingle()
        if (teacher?.approved) return NextResponse.redirect(new URL('/teacher', requestUrl.origin))
        return NextResponse.redirect(new URL('/quiz', requestUrl.origin))
      }
      if (userRole === 'parent') return NextResponse.redirect(new URL('/parent', requestUrl.origin))
      if (userRole === 'institution_admin') return NextResponse.redirect(new URL('/institution', requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL('/quiz', requestUrl.origin))
}
