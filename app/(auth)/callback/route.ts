import { NextRequest, NextResponse } from 'next/server'

// Bu route (URL: /callback) artık kullanılmıyor — tüm OAuth akışları
// /auth/callback'e yönleniyor (app/auth/callback/route.ts). Geriye dönük
// uyumluluk için (eski bağlantılar / Supabase yapılandırması) tüm sorgu
// parametrelerini (code, role, ref, ...) koruyarak gerçek callback'e yönlendiriyoruz.
export function GET(request: NextRequest) {
  const url = new URL(request.url)
  const target = new URL('/auth/callback', url.origin)
  target.search = url.search
  return NextResponse.redirect(target)
}
