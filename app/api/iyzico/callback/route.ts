import { NextRequest, NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pratium.com'

// 22 Eylül 2026 — Iyzico TAMAMEN PASİF edildi (bkz. app/api/iyzico/checkout/route.ts'teki
// yorum — checkout zaten kapatıldığı için buraya normal akışta hiç
// düşülmüyor). Devre dışı bırakmadan önce subscriptions'ta
// provider='iyzico' AND status='pending' sıfır kayıt olduğu doğrulandı,
// yani beklemede hiçbir Iyzico ödemesi yoktu. Yine de olası çok geç/yanlış
// yönlendirilmiş bir isteğe patlak bir hata sayfası göstermemek için burası
// hiçbir şeyi işlemeye ÇALIŞMADAN sessizce /pricing'e yönlendiriyor.
export async function POST(_req: NextRequest) {
  console.warn('[iyzico callback] pasif entegrasyona istek geldi — işlenmedi.')
  return NextResponse.redirect(`${APP_URL}/pricing`)
}

export async function GET() {
  return NextResponse.redirect(`${APP_URL}/pricing`)
}
