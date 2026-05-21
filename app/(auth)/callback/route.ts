import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const ref = searchParams.get('ref') || ''
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || origin

  if (!code) return NextResponse.redirect(`${APP_URL}/login`)

  const res = NextResponse.redirect(`${APP_URL}/quiz`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return req.cookies.getAll() },
        setAll(list: any[]) {
          list.forEach(({ name, value, options }: any) => res.cookies.set(name, value, options))
        },
      },
    }
  ) as any

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${APP_URL}/login`)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${APP_URL}/login`)

  const { data: profile } = await supabase
    .from('profiles').select('grade, age, name').eq('id', user.id).single()

  // Referral
  if (ref) {
    const { data: referrer } = await supabase
      .from('profiles').select('id').eq('referral_code', ref.toUpperCase()).single()
    if (referrer && referrer.id !== user.id) {
      await supabase.from('referrals').insert({ referrer_id: referrer.id, referred_id: user.id })
        .select().single().catch(() => {})
    }
  }

  // Profil eksikse → setup
  if (!profile?.grade || !profile?.age) {
    return NextResponse.redirect(`${APP_URL}/profile/setup`)
  }

  return res
}
