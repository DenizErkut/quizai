import { NextRequest, NextResponse } from 'next/server'

// Admin korumasi proxy.ts'de degil, app/admin/page.tsx icerisinde yapiliyor.
// Bu dosya sadece zorunlu oldugu icin var.
export async function proxy(req: NextRequest) {
  if (
    req.nextUrl.pathname.startsWith('/api/') &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY)
  ) {
    return NextResponse.json(
      { error: 'Supabase is not configured for this deployment.' },
      { status: 503 },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
