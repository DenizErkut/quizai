import { NextRequest, NextResponse } from 'next/server'

// Admin korumasi proxy.ts'de degil, app/admin/page.tsx icerisinde yapiliyor.
// Bu dosya sadece zorunlu oldugu icin var.
export async function proxy(req: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
