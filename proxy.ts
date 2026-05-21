import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname
  if (!pathname.startsWith('/admin')) return NextResponse.next()

  const res = NextResponse.next()

  try {
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.redirect(new URL('/login', req.url))

    const { data: profile } = await supabase
      .from('profiles').select('is_admin').eq('id', user.id).single()

    if (!profile?.is_admin) return NextResponse.redirect(new URL('/quiz', req.url))
    return res
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = { matcher: ['/admin/:path*'] }
